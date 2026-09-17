import { createHash } from 'node:crypto';

import {
  createPostgresMinIntervalStore,
  type MinIntervalStore,
} from '@/shared/lib/rate-limit';

import type { CandidateSourceInput } from './upstream-workflow';

export interface PubmedSearchInput {
  query: string;
  from: string;
  to: string;
  limit?: number;
}

export class PubmedSourceError extends Error {
  constructor(
    public readonly code: 'INVALID_RESPONSE' | 'RATE_LIMITED' | 'UNAVAILABLE',
    public readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = 'PubmedSourceError';
  }
}

export interface PubmedSourceAdapter {
  previewSearch(input: Omit<PubmedSearchInput, 'limit'>): Promise<{
    count: number;
  }>;
  searchPage(
    input: Omit<PubmedSearchInput, 'limit'> & {
      cursor?: string | null;
      pageSize: number;
    }
  ): Promise<{
    ids: string[];
    total: number;
    nextCursor: string | null;
  }>;
  searchIncremental(input: PubmedSearchInput): Promise<string[]>;
  fetchDocument(pmid: string): Promise<CandidateSourceInput>;
}

export function createPubmedSourceAdapter(
  _config: {
    fetch?: typeof fetch;
    apiKey?: string;
    tool?: string;
    email?: string;
    baseUrl?: string;
    pmcOaiBaseUrl?: string;
    sleep?: (milliseconds: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
    maxAttempts?: number;
    enforceThrottle?: boolean;
    rateLimitStore?: MinIntervalStore;
  } = {}
): PubmedSourceAdapter {
  const fetchImpl = _config.fetch ?? globalThis.fetch;
  const baseUrl = (
    _config.baseUrl ?? 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
  ).replace(/\/$/, '');
  const pmcOaiBaseUrl =
    _config.pmcOaiBaseUrl ?? 'https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/';
  const sleep =
    _config.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = _config.random ?? Math.random;
  const now = _config.now ?? Date.now;
  const maxAttempts = Math.max(1, Math.min(_config.maxAttempts ?? 3, 5));
  const rateLimitStore =
    _config.rateLimitStore ?? createPostgresMinIntervalStore();

  function url(endpoint: string, parameters: Record<string, string>) {
    const result = new URL(`${baseUrl}/${endpoint}`);
    for (const [key, value] of Object.entries({
      ...parameters,
      ...(_config.apiKey ? { api_key: _config.apiKey } : {}),
      ...(_config.tool ? { tool: _config.tool } : {}),
      ...(_config.email ? { email: _config.email } : {}),
    })) {
      result.searchParams.set(key, value);
    }
    return result;
  }

  async function request(target: URL) {
    let terminal: PubmedSourceError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (!_config.fetch || _config.enforceThrottle) {
        await acquirePubmedRequestSlot({
          key: createHash('sha256')
            .update(
              _config.apiKey
                ? `pubmed-api-key:${_config.apiKey}`
                : `pubmed-host:${baseUrl}`
            )
            .digest('hex'),
          intervalMs: _config.apiKey ? 105 : 340,
          now,
          sleep,
          store: rateLimitStore,
        });
      }
      let result: Response;
      try {
        result = await fetchImpl(target);
        if (!(result instanceof Response)) {
          throw new Error('empty response');
        }
      } catch (error) {
        terminal = new PubmedSourceError(
          'UNAVAILABLE',
          true,
          `PubMed request failed: ${error instanceof Error ? error.message : 'network error'}`
        );
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt, null, now, random));
          continue;
        }
        throw terminal;
      }
      if (result.status === 429 || result.status >= 500) {
        terminal = new PubmedSourceError(
          result.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE',
          true,
          result.status === 429
            ? 'PubMed rate limit exceeded'
            : `PubMed returned ${result.status}`
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
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          `PubMed returned ${result.status}`
        );
      }
      return result;
    }
    throw terminal!;
  }

  return {
    async previewSearch(input) {
      validateDate(input.from, 'from');
      validateDate(input.to, 'to');
      const query = input.query.trim();
      if (!query) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed query is required'
        );
      }
      const response = await request(
        url('esearch.fcgi', {
          db: 'pubmed',
          retmode: 'json',
          retmax: '0',
          sort: 'pub_date',
          datetype: 'edat',
          mindate: input.from.replaceAll('-', '/'),
          maxdate: input.to.replaceAll('-', '/'),
          term: query,
        })
      );
      const payload = await parseJson(response);
      const count = Number((payload as any)?.esearchresult?.count);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed preview payload is invalid'
        );
      }
      return { count };
    },
    async searchPage(input) {
      validateDate(input.from, 'from');
      validateDate(input.to, 'to');
      const query = input.query.trim();
      const cursor = input.cursor
        ? decodeHistoryCursor(input.cursor, input)
        : null;
      const offset = cursor?.offset ?? 0;
      if (!query) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed page input is invalid'
        );
      }
      if (
        !Number.isInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > 200
      ) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed page size is invalid'
        );
      }
      let total: number;
      let ids: unknown;
      let webEnv: string;
      let queryKey: string;
      if (!cursor) {
        const response = await request(
          url('esearch.fcgi', {
            db: 'pubmed',
            retmode: 'json',
            retstart: '0',
            retmax: String(input.pageSize),
            sort: 'pub_date',
            datetype: 'edat',
            mindate: input.from.replaceAll('-', '/'),
            maxdate: input.to.replaceAll('-', '/'),
            term: query,
            usehistory: 'y',
          })
        );
        const payload = await parseJson(response);
        const result = (payload as any)?.esearchresult;
        total = Number(result?.count);
        ids = result?.idlist;
        webEnv = result?.webenv;
        queryKey = String(result?.querykey ?? '');
      } else {
        total = cursor.total;
        webEnv = cursor.webEnv;
        queryKey = cursor.queryKey;
        const response = await request(
          url('efetch.fcgi', {
            db: 'pubmed',
            WebEnv: webEnv,
            query_key: queryKey,
            rettype: 'uilist',
            retmode: 'text',
            retstart: String(offset),
            retmax: String(input.pageSize),
          })
        );
        ids = (await response.text()).trim().split(/\s+/).filter(Boolean);
      }
      if (
        !Number.isSafeInteger(total) ||
        total < 0 ||
        !Array.isArray(ids) ||
        !ids.every(isPmid) ||
        !webEnv ||
        !/^\d+$/.test(queryKey)
      ) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed page payload is invalid'
        );
      }
      const uniqueIds = [...new Set(ids as string[])];
      const nextOffset = offset + ids.length;
      return {
        ids: uniqueIds,
        total,
        nextCursor:
          ids.length > 0 && nextOffset < total
            ? encodeHistoryCursor({
                webEnv,
                queryKey,
                offset: nextOffset,
                total,
                scopeHash: searchScopeHash(input),
              })
            : null,
      };
    },
    async searchIncremental(input) {
      validateDate(input.from, 'from');
      validateDate(input.to, 'to');
      const query = input.query.trim();
      if (!query) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed query is required'
        );
      }
      const limit = input.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed limit is invalid'
        );
      }
      const response = await request(
        url('esearch.fcgi', {
          db: 'pubmed',
          retmode: 'json',
          retmax: String(limit),
          sort: 'pub_date',
          datetype: 'edat',
          mindate: input.from.replaceAll('-', '/'),
          maxdate: input.to.replaceAll('-', '/'),
          term: query,
        })
      );
      const payload = await parseJson(response);
      const ids = (payload as any)?.esearchresult?.idlist;
      if (!Array.isArray(ids) || !ids.every(isPmid)) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed search payload is invalid'
        );
      }
      return [...new Set(ids)].sort((left, right) =>
        left.localeCompare(right, 'en', { numeric: true })
      );
    },
    async fetchDocument(pmid) {
      if (!isPmid(pmid)) {
        throw new PubmedSourceError('INVALID_RESPONSE', false, 'Invalid PMID');
      }
      const summaryResponse = await request(
        url('esummary.fcgi', {
          db: 'pubmed',
          id: pmid,
          retmode: 'json',
        })
      );
      const summaryPayload = await parseJson(summaryResponse);
      const summary = (summaryPayload as any)?.result?.[pmid];
      if (
        !summary ||
        summary.uid !== pmid ||
        typeof summary.title !== 'string'
      ) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed summary payload is invalid'
        );
      }

      const abstractResponse = await request(
        url('efetch.fcgi', {
          db: 'pubmed',
          id: pmid,
          rettype: 'abstract',
          retmode: 'text',
        })
      );
      const abstract = (await abstractResponse.text()).trim();
      if (!abstract) {
        throw new PubmedSourceError(
          'INVALID_RESPONSE',
          false,
          'PubMed abstract is unavailable'
        );
      }
      const articleIds = Array.isArray(summary.articleids)
        ? summary.articleids
        : [];
      const doiValue = articleIds.find(
        (item: any) => item?.idtype === 'doi' && typeof item?.value === 'string'
      )?.value;
      const pmcidValue = articleIds.find(
        (item: any) =>
          item?.idtype === 'pmc' &&
          typeof item?.value === 'string' &&
          /^PMC[1-9][0-9]*$/.test(item.value)
      )?.value as string | undefined;
      const pmcResult = pmcidValue
        ? await fetchPermittedPmcFullText(pmcidValue, request, pmcOaiBaseUrl)
        : null;
      const fullText =
        pmcResult?.licensePolicy.decision === 'ALLOWED' ? pmcResult.text : null;
      const sourceText = fullText ?? abstract;

      return {
        pmid,
        title: summary.title.trim(),
        abstract,
        doi:
          typeof doiValue === 'string' ? doiValue.trim().toLowerCase() : null,
        documentHash: createHash('sha256').update(sourceText).digest('hex'),
        publicationDate: parsePublicationDate(summary.pubdate),
        journal:
          typeof summary.fulljournalname === 'string' &&
          summary.fulljournalname.trim()
            ? summary.fulljournalname.trim()
            : null,
        pmcid: pmcidValue ?? null,
        sourceScope: fullText
          ? ('PMC_FULL_TEXT' as const)
          : ('ABSTRACT' as const),
        license: pmcResult?.licensePolicy.licenseText ?? null,
        ...(pmcResult ? { licensePolicy: pmcResult.licensePolicy } : {}),
        fullText,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    },
  };
}

interface HistoryCursor {
  webEnv: string;
  queryKey: string;
  offset: number;
  total: number;
  scopeHash: string;
}

async function acquirePubmedRequestSlot(input: {
  key: string;
  intervalMs: number;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  store: MinIntervalStore;
}) {
  for (;;) {
    const decision = await input.store.claim({
      key: input.key,
      now: new Date(input.now()),
      intervalMs: input.intervalMs,
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

function searchScopeHash(input: { query: string; from: string; to: string }) {
  return createHash('sha256')
    .update(`${input.query.trim()}\n${input.from}\n${input.to}`)
    .digest('hex');
}

function encodeHistoryCursor(cursor: HistoryCursor) {
  return Buffer.from(JSON.stringify({ version: 1, ...cursor })).toString(
    'base64url'
  );
}

function decodeHistoryCursor(
  value: string,
  input: { query: string; from: string; to: string }
): HistoryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      parsed?.version !== 1 ||
      typeof parsed.webEnv !== 'string' ||
      !parsed.webEnv ||
      typeof parsed.queryKey !== 'string' ||
      !/^\d+$/.test(parsed.queryKey) ||
      !Number.isSafeInteger(parsed.offset) ||
      parsed.offset < 0 ||
      !Number.isSafeInteger(parsed.total) ||
      parsed.total < parsed.offset ||
      parsed.scopeHash !== searchScopeHash(input)
    ) {
      throw new Error('invalid cursor');
    }
    return parsed as HistoryCursor;
  } catch {
    throw new PubmedSourceError(
      'INVALID_RESPONSE',
      false,
      'PubMed History cursor is invalid'
    );
  }
}

async function fetchPermittedPmcFullText(
  pmcid: string,
  request: (target: URL) => Promise<Response>,
  baseUrl: string
) {
  const target = new URL(baseUrl);
  target.searchParams.set('verb', 'GetRecord');
  target.searchParams.set(
    'identifier',
    `oai:pubmedcentral.nih.gov:${pmcid.slice(3)}`
  );
  target.searchParams.set('metadataPrefix', 'pmc');
  try {
    const response = await request(target);
    const xml = await response.text();
    if (/<error\b/i.test(xml)) {
      return pmcPolicyResult('UNKNOWN', null, null, 'PMC_RECORD_UNAVAILABLE');
    }
    const licenseElement = xml.match(
      /<license\b([^>]*)>([\s\S]*?)<\/license>/i
    );
    const licenseType = licenseElement
      ? firstMatch(licenseElement[1], /license-type=["']([^"']+)["']/i) || null
      : null;
    const licenseText = licenseElement
      ? xmlText(
          firstMatch(
            licenseElement[2],
            /<license-p\b[^>]*>([\s\S]*?)<\/license-p>/i
          )
        ) || null
      : null;
    const decision = decidePmcLicense(licenseText);
    const body = firstMatch(xml, /<body\b[^>]*>([\s\S]*?)<\/body>/i);
    const paragraphs = body
      ? [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
          .map((match) => xmlText(match[1]))
          .filter(Boolean)
      : [];
    return {
      licensePolicy: {
        decision: decision.decision,
        licenseType,
        licenseText,
        reason: decision.reason,
      },
      text:
        decision.decision === 'ALLOWED' && paragraphs.length
          ? paragraphs.join('\n\n')
          : null,
    };
  } catch {
    return pmcPolicyResult('UNKNOWN', null, null, 'PMC_LICENSE_LOOKUP_FAILED');
  }
}

function decidePmcLicense(licenseText: string | null): {
  decision: 'ALLOWED' | 'REJECTED' | 'UNKNOWN';
  reason: string;
} {
  if (!licenseText) {
    return { decision: 'UNKNOWN', reason: 'PMC_LICENSE_NOT_DECLARED' };
  }
  const value = licenseText.normalize('NFKC').toLowerCase();
  const restricted =
    /non[- ]?commercial|no[- ]?derivatives|\bcc\s*by[- ]?(?:nc|nd)\b/.test(
      value
    );
  const allowed =
    /\bcc\s*0\b|creative commons zero|public domain/.test(value) ||
    (/\bcc\s*by\b|creative commons attribution/.test(value) && !restricted);
  return allowed
    ? { decision: 'ALLOWED', reason: 'PMC_LICENSE_ALLOWED_BY_WHITELIST' }
    : { decision: 'REJECTED', reason: 'PMC_LICENSE_NOT_IN_WHITELIST' };
}

function pmcPolicyResult(
  decision: 'ALLOWED' | 'REJECTED' | 'UNKNOWN',
  licenseType: string | null,
  licenseText: string | null,
  reason: string
) {
  return {
    licensePolicy: { decision, licenseType, licenseText, reason },
    text: null,
  };
}

function firstMatch(value: string, expression: RegExp) {
  return value.match(expression)?.[1] ?? '';
}

function xmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isPmid(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value);
}

function validateDate(value: string, label: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new PubmedSourceError(
      'INVALID_RESPONSE',
      false,
      `${label} date is invalid`
    );
  }
}

async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new PubmedSourceError(
      'INVALID_RESPONSE',
      false,
      'PubMed returned invalid JSON'
    );
  }
}

function parsePublicationDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value
    .trim()
    .match(/^(\d{4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}))?/);
  if (!match) return null;
  const months: Record<string, string> = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  };
  const month = match[2] ? months[match[2]] : '01';
  if (!month) return null;
  return `${match[1]}-${month}-${String(match[3] ?? '1').padStart(2, '0')}`;
}
