import { createHash } from 'node:crypto';
import { setTimeout as sleepFor } from 'node:timers/promises';

import {
  createPostgresMinIntervalStore,
  type MinIntervalStore,
} from '@/shared/lib/rate-limit';

export type CivicApplicability =
  | 'EXACT'
  | 'GROUP_INCLUDES_EXACT'
  | 'COMPOUND_REQUIRES_REVIEW'
  | 'OTHER_REQUIRES_REVIEW';

export interface CivicEvidenceItemProvenance {
  eid: number;
  name: string;
  molecularProfile: string;
  disease: string;
  diseaseDoid: string | null;
  therapies: string[];
  evidenceLevel: string;
  evidenceDirection: string;
  significance: string;
  citation: string | null;
  publicationYear: number | null;
  applicability: CivicApplicability;
}

export interface CivicCandidateProvenance {
  source: 'CIVIC';
  retrievedAt: string;
  query: CivicPilotQuery;
  evidenceItems: CivicEvidenceItemProvenance[];
}

export interface CivicSourceAdapter {
  previewSearch(input: CivicSearchInput): Promise<{ count: number }>;
  searchPage(
    input: CivicSearchInput & {
      cursor?: string | null;
      pageSize: number;
    }
  ): Promise<{
    ids: string[];
    total: number;
    nextCursor: string | null;
    provenanceById: Record<string, CivicCandidateProvenance>;
  }>;
}

interface CivicSearchInput {
  query: string;
  from: string;
  to: string;
}

export class CivicSourceError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_RESPONSE'
      | 'RATE_LIMITED'
      | 'UNAVAILABLE'
      | 'UNSUPPORTED_SCOPE',
    public readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = 'CivicSourceError';
  }
}

interface CivicPilotQuery {
  version: 1;
  diseaseId: string;
  variantId: string;
  geneSymbol: string;
  profileName: string;
  diseaseName: string;
}

const PILOT_TARGETS: CivicPilotQuery[] = [
  target(
    'disease_nsclc',
    'variant_egfr_l858r',
    'EGFR',
    'L858R',
    'Lung Non-small Cell Carcinoma'
  ),
  target(
    'disease_nsclc',
    'variant_egfr_e746_a750del',
    'EGFR',
    'E746_A750del',
    'Lung Non-small Cell Carcinoma'
  ),
  target(
    'disease_nsclc',
    'variant_egfr_t790m',
    'EGFR',
    'T790M',
    'Lung Non-small Cell Carcinoma'
  ),
  target(
    'disease_nsclc',
    'variant_kras_g12c',
    'KRAS',
    'G12C',
    'Lung Non-small Cell Carcinoma'
  ),
  target(
    'disease_crc',
    'variant_kras_g12c',
    'KRAS',
    'G12C',
    'Colorectal Cancer'
  ),
  target(
    'disease_crc',
    'variant_kras_g12d',
    'KRAS',
    'G12D',
    'Colorectal Cancer'
  ),
];

const EVIDENCE_ITEMS_QUERY = `
  query CivicPilotEvidenceItems(
    $first: Int!
    $after: String
    $molecularProfileName: String!
    $diseaseName: String!
  ) {
    evidenceItems(
      first: $first
      after: $after
      molecularProfileName: $molecularProfileName
      diseaseName: $diseaseName
      status: ACCEPTED
      evidenceType: PREDICTIVE
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        status
        evidenceType
        molecularProfile { name }
        disease { name doid }
        source { citationId sourceType citation publicationYear }
        therapies { name }
        evidenceLevel
        evidenceDirection
        significance
      }
    }
  }
`;

export function buildCivicPilotQuery(input: {
  diseaseId: string;
  variantId: string;
}) {
  const matched = PILOT_TARGETS.find(
    (candidate) =>
      candidate.diseaseId === input.diseaseId &&
      candidate.variantId === input.variantId
  );
  return matched ? JSON.stringify(matched) : null;
}

export function createCivicSourceAdapter(
  _config: {
    fetch?: typeof fetch;
    baseUrl?: string;
    apiKey?: string;
    sleep?: (milliseconds: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
    maxAttempts?: number;
    enforceThrottle?: boolean;
    rateLimitStore?: MinIntervalStore;
  } = {}
): CivicSourceAdapter {
  const fetchImpl = _config.fetch ?? globalThis.fetch;
  const baseUrl = _config.baseUrl ?? 'https://civicdb.org/api/graphql';
  const sleep = _config.sleep ?? sleepFor;
  const random = _config.random ?? Math.random;
  const now = _config.now ?? Date.now;
  const maxAttempts = Math.max(1, Math.min(_config.maxAttempts ?? 3, 5));
  const rateLimitStore =
    _config.rateLimitStore ?? createPostgresMinIntervalStore();

  async function request(
    target: CivicPilotQuery,
    first: number,
    after: string | null
  ) {
    let terminal: CivicSourceError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (!_config.fetch || _config.enforceThrottle) {
        await acquireRequestSlot({
          key: createHash('sha256')
            .update(`civic-host:${baseUrl}`)
            .digest('hex'),
          now,
          sleep,
          store: rateLimitStore,
        });
      }
      let result: Response;
      try {
        result = await fetchImpl(baseUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(_config.apiKey
              ? { authorization: `Bearer ${_config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            query: EVIDENCE_ITEMS_QUERY,
            variables: {
              first,
              after,
              molecularProfileName: target.profileName,
              diseaseName: target.diseaseName,
            },
          }),
        });
        if (!(result instanceof Response)) throw new Error('empty response');
      } catch (error) {
        terminal = new CivicSourceError(
          'UNAVAILABLE',
          true,
          `CIViC request failed: ${
            error instanceof Error ? error.message : 'network error'
          }`
        );
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt, null, now, random));
          continue;
        }
        throw terminal;
      }
      if (result.status === 429 || result.status >= 500) {
        terminal = new CivicSourceError(
          result.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE',
          true,
          result.status === 429
            ? 'CIViC rate limit exceeded'
            : `CIViC returned ${result.status}`
        );
        if (attempt < maxAttempts) {
          await sleep(
            backoffMs(attempt, result.headers.get('retry-after'), now, random)
          );
          continue;
        }
        throw terminal;
      }
      if (!result.ok) {
        throw new CivicSourceError(
          'INVALID_RESPONSE',
          false,
          `CIViC returned ${result.status}`
        );
      }
      let payload: unknown;
      try {
        payload = await result.json();
      } catch {
        throw invalidResponse('CIViC returned invalid JSON');
      }
      if (
        !payload ||
        typeof payload !== 'object' ||
        ('errors' in payload &&
          Array.isArray(payload.errors) &&
          payload.errors.length)
      ) {
        throw invalidResponse('CIViC GraphQL request failed');
      }
      return parseConnection(payload);
    }
    throw terminal!;
  }

  return {
    async previewSearch(input) {
      const query = parsePilotQuery(input.query);
      const connection = await request(query, 1, null);
      return { count: connection.totalCount };
    },
    async searchPage(input) {
      const query = parsePilotQuery(input.query);
      if (
        !Number.isInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > 100
      ) {
        throw invalidResponse('CIViC page size is invalid');
      }
      const after = input.cursor
        ? decodeCursor(input.cursor, input.query)
        : null;
      const connection = await request(query, input.pageSize, after);
      const provenanceById: Record<string, CivicCandidateProvenance> = {};
      for (const item of connection.nodes) {
        const normalized = normalizeEvidenceItem(item, query);
        if (!normalized) continue;
        const current = provenanceById[normalized.pmid] ?? {
          source: 'CIVIC' as const,
          retrievedAt: new Date(now()).toISOString(),
          query,
          evidenceItems: [],
        };
        current.evidenceItems.push(normalized.provenance);
        provenanceById[normalized.pmid] = current;
      }
      return {
        ids: Object.keys(provenanceById),
        total: connection.totalCount,
        nextCursor:
          connection.pageInfo.hasNextPage && connection.pageInfo.endCursor
            ? encodeCursor(connection.pageInfo.endCursor, input.query)
            : null,
        provenanceById,
      };
    },
  };
}

function target(
  diseaseId: string,
  variantId: string,
  geneSymbol: string,
  profileName: string,
  diseaseName: string
): CivicPilotQuery {
  return {
    version: 1,
    diseaseId,
    variantId,
    geneSymbol,
    profileName,
    diseaseName,
  };
}

function parsePilotQuery(value: string): CivicPilotQuery {
  try {
    const parsed = JSON.parse(value) as Partial<CivicPilotQuery>;
    const canonical = PILOT_TARGETS.find(
      (candidate) =>
        candidate.diseaseId === parsed.diseaseId &&
        candidate.variantId === parsed.variantId
    );
    if (!canonical || JSON.stringify(canonical) !== JSON.stringify(parsed)) {
      throw new Error('unsupported');
    }
    return canonical;
  } catch {
    throw new CivicSourceError(
      'UNSUPPORTED_SCOPE',
      false,
      'CIViC query is outside the approved pilot scope'
    );
  }
}

function parseConnection(payload: unknown) {
  const connection = (payload as any)?.data?.evidenceItems;
  if (
    !connection ||
    !Number.isSafeInteger(connection.totalCount) ||
    connection.totalCount < 0 ||
    !connection.pageInfo ||
    typeof connection.pageInfo.hasNextPage !== 'boolean' ||
    !Array.isArray(connection.nodes) ||
    (connection.pageInfo.hasNextPage &&
      (typeof connection.pageInfo.endCursor !== 'string' ||
        !connection.pageInfo.endCursor)) ||
    (!connection.pageInfo.hasNextPage && connection.pageInfo.endCursor !== null)
  ) {
    throw invalidResponse('CIViC evidence-item payload is invalid');
  }
  return connection as {
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: unknown[];
  };
}

function normalizeEvidenceItem(item: unknown, query: CivicPilotQuery) {
  const value = item as any;
  const profile = value?.molecularProfile?.name;
  const pmid = value?.source?.citationId;
  if (
    !Number.isSafeInteger(value?.id) ||
    typeof value?.name !== 'string' ||
    value.status !== 'ACCEPTED' ||
    value.evidenceType !== 'PREDICTIVE' ||
    value?.source?.sourceType !== 'PUBMED' ||
    typeof pmid !== 'string' ||
    !/^[1-9][0-9]*$/.test(pmid) ||
    typeof profile !== 'string' ||
    !profileMatchesTarget(profile, query) ||
    typeof value?.disease?.name !== 'string' ||
    normalizeText(value.disease.name) !== normalizeText(query.diseaseName) ||
    !Array.isArray(value.therapies) ||
    !value.therapies.every(
      (therapy: unknown) =>
        therapy &&
        typeof therapy === 'object' &&
        typeof (therapy as { name?: unknown }).name === 'string'
    ) ||
    typeof value.evidenceLevel !== 'string' ||
    typeof value.evidenceDirection !== 'string' ||
    typeof value.significance !== 'string'
  ) {
    return null;
  }
  return {
    pmid,
    provenance: {
      eid: value.id,
      name: value.name,
      molecularProfile: profile,
      disease: value.disease.name,
      diseaseDoid:
        typeof value.disease.doid === 'string' ? value.disease.doid : null,
      therapies: value.therapies.map(
        (therapy: { name: string }) => therapy.name
      ),
      evidenceLevel: value.evidenceLevel,
      evidenceDirection: value.evidenceDirection,
      significance: value.significance,
      citation:
        typeof value.source.citation === 'string'
          ? value.source.citation
          : null,
      publicationYear: Number.isSafeInteger(value.source.publicationYear)
        ? value.source.publicationYear
        : null,
      applicability: classifyApplicability(profile, query),
    } satisfies CivicEvidenceItemProvenance,
  };
}

function profileMatchesTarget(profile: string, query: CivicPilotQuery) {
  const pattern = new RegExp(
    `(?:^|\\b)${escapeRegex(query.geneSymbol)}\\s+${escapeRegex(
      query.profileName
    )}(?:\\b|$)`,
    'i'
  );
  return pattern.test(profile);
}

function classifyApplicability(
  profile: string,
  query: CivicPilotQuery
): CivicApplicability {
  const normalized = profile.trim().replace(/\s+/g, ' ').toUpperCase();
  const exact = `${query.geneSymbol} ${query.profileName}`.toUpperCase();
  if (normalized === exact) return 'EXACT';
  if (/\bAND\b/i.test(profile)) return 'COMPOUND_REQUIRES_REVIEW';
  if (/\bOR\b/i.test(profile)) return 'GROUP_INCLUDES_EXACT';
  return 'OTHER_REQUIRES_REVIEW';
}

function invalidResponse(message: string) {
  return new CivicSourceError('INVALID_RESPONSE', false, message);
}

function cursorScopeHash(query: string) {
  return createHash('sha256').update(query).digest('hex');
}

function encodeCursor(after: string, query: string) {
  return Buffer.from(
    JSON.stringify({ version: 1, after, scopeHash: cursorScopeHash(query) })
  ).toString('base64url');
}

function decodeCursor(value: string, query: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed?.version !== 1 ||
      typeof parsed.after !== 'string' ||
      !parsed.after ||
      parsed.scopeHash !== cursorScopeHash(query)
    ) {
      throw new Error('invalid cursor');
    }
    return parsed.after as string;
  } catch {
    throw invalidResponse('CIViC cursor is invalid');
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function acquireRequestSlot(input: {
  key: string;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  store: MinIntervalStore;
}) {
  for (;;) {
    const decision = await input.store.claim({
      key: input.key,
      now: new Date(input.now()),
      intervalMs: 340,
    });
    if (decision.allowed) return;
    await input.sleep(Math.max(1, decision.retryAfterMs));
  }
}

function backoffMs(
  attempt: number,
  retryAfter: string | null,
  now: () => number,
  random: () => number
) {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now());
  }
  return (
    Math.min(5_000, 100 * 2 ** Math.max(0, attempt - 1)) +
    Math.floor(random() * 100)
  );
}
