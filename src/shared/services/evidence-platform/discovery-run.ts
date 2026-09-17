import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CivicCandidateProvenance,
  CivicSourceAdapter,
} from './civic-source-adapter';
import { OperationsError } from './operations';
import type { PubmedSourceAdapter } from './pubmed-source-adapter';
import { hashArtifact } from './skill-runtime';

export type DiscoveryScopeInput =
  | { mode: 'ALL_KNOWLEDGE' }
  | {
      mode: 'SCOPED';
      diseaseIds: string[];
      geneIds: string[];
      variantIds: string[];
    };

export type DiscoveryDocumentLimit = 50 | 100 | 'ALL';
export type DiscoverySource = 'PUBMED' | 'CIVIC';

export interface DiscoveryPreviewRequest {
  source?: DiscoverySource;
  scope: DiscoveryScopeInput;
  documentLimit: DiscoveryDocumentLimit;
  window?: { from?: string; to?: string };
}

export interface DiscoveryScopeSnapshot {
  source?: DiscoverySource;
  mode: DiscoveryScopeInput['mode'];
  diseaseIds: string[];
  geneIds: string[];
  variantIds: string[];
  aliasVersion: string;
  knowledgeReleaseId: string;
  knowledgeReleaseVersion: string;
}

export interface DiscoveryQueryPlan {
  strategyId: string;
  strategyVersion: string;
  associationId: string;
  query: string;
  label: string;
  estimatedMatchCount?: number;
}

export interface PersistentPlatformJob {
  id: string;
  jobType: 'DISCOVERY_RUN' | 'CANDIDATE_RETRY' | 'QUESTION_RUN';
  resourceId: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export interface DiscoveryPreviewPayload {
  snapshot: DiscoveryScopeSnapshot;
  documentLimit: DiscoveryDocumentLimit;
  window: { from: string; to: string };
  queries: DiscoveryQueryPlan[];
  estimatedMatchCount: number;
  warnings: string[];
  previewHash: string;
  expiresAt: string;
}

export interface DiscoveryRunRepository {
  resolveDiscoveryScope(
    scope: DiscoveryScopeInput,
    source?: DiscoverySource
  ): Promise<{
    snapshot: DiscoveryScopeSnapshot;
    queries: DiscoveryQueryPlan[];
    lastSuccessfulCutoffAt: string | null;
    overlapDays: number;
  }>;
  createManualDiscoveryRun(input: {
    actorId: string;
    idempotencyKey: string;
    preview: DiscoveryPreviewPayload;
    workflowVersion: string;
  }): Promise<{ run: unknown; idempotent: boolean }>;
  transitionDiscoveryRun(input: {
    runId: string;
    action: 'pause' | 'resume' | 'cancel';
    actorId: string;
  }): Promise<unknown>;
  claimPlatformJob(input: {
    workerId: string;
    lockTimeoutMs: number;
  }): Promise<PersistentPlatformJob | null>;
  completePlatformJob(jobId: string): Promise<void>;
  failPlatformJob(input: {
    jobId: string;
    errorCode: string;
    errorSummary: string;
  }): Promise<{ status: 'RETRY_WAIT' | 'DEAD_LETTER' }>;
  beginDiscoveryRun(runId: string): Promise<DiscoveryExecutionPlan | null>;
  getDiscoveryRunStatus(
    runId: string
  ): Promise<
    | 'PENDING'
    | 'RUNNING'
    | 'PAUSED'
    | 'CANCELLED'
    | 'SUCCEEDED'
    | 'PARTIAL_SUCCESS'
    | 'FAILED'
    | null
  >;
  claimDiscoveryDocument(input: {
    runId: string;
    externalId: string;
    strategyId: string;
  }): Promise<{
    shouldProcess: boolean;
    limitReached: boolean;
    uniqueDiscoveredCount: number;
  }>;
  recordDiscoveryDocumentOutcome(input: {
    runId: string;
    externalId: string;
    outcome: 'DUPLICATE' | 'EXCLUDED' | 'READY_FOR_REVIEW' | 'FAILED';
    candidateDocumentId?: string;
    errorCode?: string;
    errorSummary?: string;
  }): Promise<{
    counts: DiscoveryExecutionCounts;
    processedDocumentCount: number;
  }>;
  recordDiscoveryProvenance?(input: {
    runId: string;
    externalId: string;
    strategyId: string;
    provenance: CivicCandidateProvenance;
  }): Promise<void>;
  attachCandidateToDiscoveryStrategy(
    candidateDocumentId: string,
    strategyId: string
  ): Promise<void>;
  saveDiscoveryQueryProgress(input: {
    queryId: string;
    sourceCursor: string | null;
    exhausted: boolean;
  }): Promise<void>;
  finishDiscoveryRun(input: {
    runId: string;
    status: 'SUCCEEDED' | 'PARTIAL_SUCCESS' | 'FAILED';
    errorCode?: string | null;
    errorSummary?: string | null;
  }): Promise<void>;
  touchWorkerHeartbeat?(input: {
    workerId: string;
    status: 'IDLE' | 'RUNNING' | 'ERROR';
    currentJobId: string | null;
  }): Promise<void>;
}

export interface DiscoveryExecutionCounts {
  discovered: number;
  duplicate: number;
  excluded: number;
  processing: number;
  readyForReview: number;
  published: number;
  failed: number;
}

export interface DiscoveryExecutionPlan {
  run: {
    id: string;
    source?: DiscoverySource;
    status: 'PENDING' | 'RUNNING';
    windowFrom: string;
    windowTo: string;
    documentLimit: 50 | 100 | null;
    uniqueDiscoveredCount: number;
    processedDocumentCount: number;
    counts: DiscoveryExecutionCounts;
  };
  queries: Array<
    DiscoveryQueryPlan & {
      id: string;
      sourceCursor: string | null;
      exhausted: boolean;
    }
  >;
}

export async function previewDiscoveryRun(_input: {
  actorId: string;
  request: DiscoveryPreviewRequest;
  repository: DiscoveryRunRepository;
  pubmed: PubmedSourceAdapter;
  civic?: CivicSourceAdapter;
  secret: string;
  now?: () => Date;
}): Promise<DiscoveryPreviewPayload & { previewToken: string }> {
  const source = _input.request.source ?? 'PUBMED';
  const scope = normalizeScope(_input.request.scope);
  if (
    scope.mode === 'SCOPED' &&
    scope.diseaseIds.length + scope.geneIds.length + scope.variantIds.length ===
      0
  ) {
    throw new OperationsError('DISCOVERY_SCOPE_REQUIRED', 400);
  }
  if (![50, 100, 'ALL'].includes(_input.request.documentLimit)) {
    throw new OperationsError('INVALID_DOCUMENT_LIMIT', 400);
  }
  const resolved =
    source === 'CIVIC'
      ? await _input.repository.resolveDiscoveryScope(scope, source)
      : await _input.repository.resolveDiscoveryScope(scope);
  if (!resolved.queries.length) {
    throw new OperationsError('DISCOVERY_SCOPE_CONFLICT', 422);
  }
  const now = (_input.now ?? (() => new Date()))();
  const to = parseDate(_input.request.window?.to, now);
  const fallbackFrom = resolved.lastSuccessfulCutoffAt
    ? new Date(resolved.lastSuccessfulCutoffAt)
    : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (resolved.lastSuccessfulCutoffAt) {
    fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - resolved.overlapDays);
  }
  const from = parseDate(_input.request.window?.from, fallbackFrom);
  if (from.getTime() > to.getTime()) {
    throw new OperationsError('INVALID_DISCOVERY_WINDOW', 400);
  }
  const window = { from: from.toISOString(), to: to.toISOString() };
  if (source === 'CIVIC' && !_input.civic) {
    throw new OperationsError('CIVIC_SOURCE_NOT_CONFIGURED', 503);
  }
  const sourceAdapter = source === 'CIVIC' ? _input.civic! : _input.pubmed;
  const estimates = await Promise.all(
    resolved.queries.map((query) =>
      sourceAdapter.previewSearch({
        query: query.query,
        from: window.from.slice(0, 10),
        to: window.to.slice(0, 10),
      })
    )
  );
  const queries = resolved.queries.map((query, index) => ({
    ...query,
    estimatedMatchCount: estimates[index].count,
  }));
  const estimatedMatchCount = estimates.reduce(
    (total, estimate) => total + estimate.count,
    0
  );
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const unsigned = {
    snapshot: { ...resolved.snapshot, source },
    documentLimit: _input.request.documentLimit,
    window,
    queries,
    estimatedMatchCount,
    warnings: buildWarnings(
      source,
      _input.request.documentLimit,
      estimatedMatchCount,
      resolved.queries.length
    ),
    expiresAt,
  };
  const preview: DiscoveryPreviewPayload = {
    ...unsigned,
    previewHash: hashArtifact({
      snapshot: unsigned.snapshot,
      documentLimit: unsigned.documentLimit,
      window: unsigned.window,
      queries: unsigned.queries.map(
        ({ estimatedMatchCount: _estimate, ...query }) => query
      ),
    }),
  };
  return {
    ...preview,
    previewToken: signPreviewToken(
      { actorId: _input.actorId, preview },
      _input.secret
    ),
  };
}

export async function createDiscoveryRunFromPreview(_input: {
  actorId: string;
  previewToken: string;
  idempotencyKey: string;
  repository: DiscoveryRunRepository;
  secret: string;
  workflowVersion: string;
  now?: () => Date;
}) {
  if (!_input.idempotencyKey.trim()) {
    throw new OperationsError('IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  const value = verifyPreviewToken(_input.previewToken, _input.secret);
  if (!value || value.actorId !== _input.actorId) {
    throw new OperationsError('PREVIEW_TOKEN_INVALID', 409);
  }
  const now = (_input.now ?? (() => new Date()))();
  if (new Date(value.preview.expiresAt).getTime() <= now.getTime()) {
    throw new OperationsError('PREVIEW_TOKEN_EXPIRED', 409);
  }
  return _input.repository.createManualDiscoveryRun({
    actorId: _input.actorId,
    idempotencyKey: _input.idempotencyKey.trim(),
    preview: value.preview,
    workflowVersion: _input.workflowVersion,
  });
}

function normalizeScope(scope: DiscoveryScopeInput): DiscoveryScopeInput {
  if (scope.mode === 'ALL_KNOWLEDGE') return { mode: 'ALL_KNOWLEDGE' };
  return {
    mode: 'SCOPED',
    diseaseIds: normalizedIds(scope.diseaseIds),
    geneIds: normalizedIds(scope.geneIds),
    variantIds: normalizedIds(scope.variantIds),
  };
}

function normalizedIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, 'en')
  );
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return new Date(fallback);
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new OperationsError('INVALID_DISCOVERY_WINDOW', 400);
  }
  return result;
}

function buildWarnings(
  source: DiscoverySource,
  limit: DiscoveryDocumentLimit,
  estimate: number,
  queryCount: number
) {
  const warnings =
    source === 'CIVIC'
      ? [
          'CIViC 数量按证据条目估算；同一 PubMed 文献可能对应多个条目，入库前会按 PMID 去重。',
          'CIViC 仅用于发现候选；系统仍会获取 PubMed 原文并走现有抽取与人工审核，不会直接发布。',
        ]
      : [
          `预估数来自 ${queryCount} 个 PubMed 子查询，可能包含重复或已入库文献。`,
        ];
  if (limit === 'ALL') {
    warnings.push(
      `将分页处理当前时间窗内预估 ${estimate} 篇结果，耗时与模型费用可能较高。`
    );
  } else if (estimate > limit) {
    warnings.push(`去重后最多处理 ${limit} 篇唯一文献。`);
  }
  return warnings;
}

function signPreviewToken(value: unknown, secret: string) {
  if (!secret.trim()) throw new Error('Preview signing secret is required');
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function verifyPreviewToken(token: string, secret: string) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !secret.trim()) return null;
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      actorId: string;
      preview: DiscoveryPreviewPayload;
    };
  } catch {
    return null;
  }
}
