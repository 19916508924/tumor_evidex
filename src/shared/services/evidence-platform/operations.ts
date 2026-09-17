import type {
  DiscoveryCounts,
  DiscoveryRunDto,
  DiscoveryStrategyDto,
  OpsDashboardDto,
  OpsListQuery,
  PageResult,
} from '@/shared/types/evidence-platform-api';

import {
  extractEvidenceDraft,
  type EvidenceExtractionGenerator,
} from './extract-evidence-draft';
import type { PubmedSourceAdapter } from './pubmed-source-adapter';
import {
  submitPubmedCandidate,
  type UpstreamWorkflowRepository,
} from './upstream-workflow';

export type DefinitionKind = 'agents' | 'skills' | 'workflows';

export interface OperationsRepository {
  getDashboard(range: '7d' | '30d'): Promise<OpsDashboardDto>;
  getWorkerHealth(): Promise<unknown>;
  listAssociations(input: OpsListQuery): Promise<PageResult<unknown>>;
  listCandidates(input: OpsListQuery): Promise<PageResult<unknown>>;
  getCandidate(id: string): Promise<unknown | null>;
  listReviewTasks(input: OpsListQuery): Promise<PageResult<unknown>>;
  updateReviewDraft(input: {
    reviewTaskId: string;
    expectedDraftVersion: number;
    draft: unknown;
    reason: string;
    actorId: string;
  }): Promise<unknown>;
  listReleases(input: OpsListQuery): Promise<PageResult<unknown>>;
  getRelease(id: string): Promise<unknown | null>;
  listDefinitions(
    kind: DefinitionKind,
    input: OpsListQuery
  ): Promise<PageResult<unknown>>;
  createDefinitionDraft(input: {
    kind: DefinitionKind;
    definitionId: string;
    sourceVersionId: string;
    version: string;
    actorId: string;
  }): Promise<unknown>;
  updateDefinitionDraft(input: {
    kind: DefinitionKind;
    definitionId: string;
    versionId: string;
    patch: Record<string, unknown>;
    actorId: string;
  }): Promise<unknown>;
  evaluateDefinitionDraft(input: {
    kind: DefinitionKind;
    definitionId: string;
    versionId: string;
    suiteId?: string;
    actorId: string;
  }): Promise<unknown>;
  activateDefinitionVersion(input: {
    kind: DefinitionKind;
    definitionId: string;
    versionId: string;
    actorId: string;
  }): Promise<unknown>;
  rollbackDefinitionVersion(input: {
    kind: DefinitionKind;
    definitionId: string;
    versionId: string;
    reason: string;
    actorId: string;
  }): Promise<unknown>;
  listDefinitionAudit(input: {
    kind: DefinitionKind;
    definitionId: string;
    page: number;
    pageSize: number;
  }): Promise<PageResult<unknown>>;
  listWorkflowRuns(input: OpsListQuery): Promise<PageResult<unknown>>;
  getWorkflowRun(id: string): Promise<unknown | null>;
  listQuestionRuns(input: OpsListQuery): Promise<PageResult<unknown>>;
  getQuestionRun(id: string): Promise<unknown | null>;
  listDiscoveryStrategies(
    input: OpsListQuery
  ): Promise<PageResult<DiscoveryStrategyDto>>;
  getDiscoveryStrategy(id: string): Promise<DiscoveryStrategyDto | null>;
  setDiscoveryStrategyStatus(input: {
    id: string;
    status: 'ACTIVE' | 'PAUSED';
    actorId: string;
  }): Promise<DiscoveryStrategyDto | null>;
  createDiscoveryRun(input: {
    strategyId: string;
    actorId: string;
    windowFrom: string;
    windowTo: string;
    workflowVersion: string;
  }): Promise<{ run: DiscoveryRunDto; idempotent: boolean }>;
  markDiscoveryRunRunning(id: string): Promise<DiscoveryRunDto | null>;
  completeDiscoveryRun(input: {
    id: string;
    status: 'SUCCEEDED' | 'PARTIAL_SUCCESS' | 'FAILED';
    counts: DiscoveryCounts;
    errorCode?: string | null;
    errorSummary?: string | null;
    advanceCutoffTo?: string;
  }): Promise<DiscoveryRunDto>;
  attachCandidateToStrategy(
    candidateId: string,
    strategyId: string
  ): Promise<void>;
  listDiscoveryRuns(input: OpsListQuery): Promise<PageResult<DiscoveryRunDto>>;
  getDiscoveryRun(id: string): Promise<unknown | null>;
  retryCandidate(input: {
    id: string;
    actorId: string;
  }): Promise<{ candidateId: string; status: string; accepted: boolean }>;
}

export class OperationsError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(code);
    this.name = 'OperationsError';
  }
}

export async function triggerDiscoveryRun(_input: {
  strategyId: string;
  actorId: string;
  from?: string;
  to?: string;
  repository: OperationsRepository;
  workflowVersion: string;
  now?: () => Date;
}) {
  const strategy = await _input.repository.getDiscoveryStrategy(
    _input.strategyId
  );
  if (!strategy) throw new OperationsError('DISCOVERY_STRATEGY_NOT_FOUND', 404);
  if (strategy.status !== 'ACTIVE') {
    throw new OperationsError('DISCOVERY_STRATEGY_PAUSED', 409);
  }
  const now = (_input.now ?? (() => new Date()))();
  const to = parseDate(_input.to, now);
  const defaultFrom = strategy.lastSuccessfulCutoffAt
    ? new Date(strategy.lastSuccessfulCutoffAt)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - strategy.overlapDays);
  const from = parseDate(_input.from, defaultFrom);
  if (from.getTime() > to.getTime()) {
    throw new OperationsError('INVALID_DISCOVERY_WINDOW', 400);
  }
  return _input.repository.createDiscoveryRun({
    strategyId: strategy.id,
    actorId: _input.actorId,
    windowFrom: from.toISOString(),
    windowTo: to.toISOString(),
    workflowVersion: _input.workflowVersion,
  });
}

export async function processDiscoveryRun(_input: {
  runId: string;
  repository: OperationsRepository;
  upstreamRepository: UpstreamWorkflowRepository;
  pubmed: PubmedSourceAdapter;
  extractionGenerator: EvidenceExtractionGenerator;
  workflowVersion: string;
  agentVersion: string;
}) {
  const detail = (await _input.repository.getDiscoveryRun(_input.runId)) as {
    run: DiscoveryRunDto;
    strategy: DiscoveryStrategyDto;
  } | null;
  if (!detail) return null;
  const running = await _input.repository.markDiscoveryRunRunning(_input.runId);
  if (!running) return detail.run;
  const counts: DiscoveryCounts = {
    discovered: 0,
    duplicate: 0,
    excluded: 0,
    processing: 0,
    readyForReview: 0,
    published: 0,
    failed: 0,
  };
  const errors: string[] = [];
  try {
    const pmids = await _input.pubmed.searchIncremental({
      query: detail.strategy.query,
      from: detail.run.windowFrom.slice(0, 10),
      to: detail.run.windowTo.slice(0, 10),
      limit: detail.strategy.maxResults,
    });
    counts.discovered = pmids.length;
    for (const pmid of pmids) {
      counts.processing += 1;
      try {
        const source = await _input.pubmed.fetchDocument(pmid);
        const duplicate = await _input.upstreamRepository.findDuplicate({
          sourceType: 'PUBMED',
          externalId: source.pmid,
          doi: source.doi ?? null,
          documentHash: source.documentHash,
        });
        if (duplicate) {
          counts.duplicate += 1;
          await _input.repository.attachCandidateToStrategy(
            duplicate.candidateId,
            detail.strategy.id
          );
          continue;
        }
        const association =
          await _input.upstreamRepository.getAssociationReviewContext(
            detail.strategy.associationId
          );
        if (!association) {
          throw new Error('Configured association is unavailable');
        }
        const draft = await extractEvidenceDraft({
          source,
          association,
          generator: _input.extractionGenerator,
        });
        const created = await submitPubmedCandidate({
          source,
          draft,
          repository: _input.upstreamRepository,
          workflowVersion: _input.workflowVersion,
          agentVersion: _input.agentVersion,
          skillVersions: [
            'extract_evidence_claims@1.0.0',
            'validate_draft_completeness@1.0.0',
          ],
        });
        await _input.repository.attachCandidateToStrategy(
          created.candidateId,
          detail.strategy.id
        );
        if (created.duplicate) counts.duplicate += 1;
        else counts.readyForReview += 1;
      } catch (error) {
        counts.failed += 1;
        errors.push(error instanceof Error ? error.message : 'unknown error');
      } finally {
        counts.processing -= 1;
      }
    }
    const status =
      counts.failed === 0
        ? 'SUCCEEDED'
        : counts.readyForReview > 0 || counts.duplicate > 0
          ? 'PARTIAL_SUCCESS'
          : 'FAILED';
    return _input.repository.completeDiscoveryRun({
      id: _input.runId,
      status,
      counts,
      errorCode: errors.length ? 'CANDIDATE_PROCESSING_FAILED' : null,
      errorSummary: errors.length ? errors.slice(0, 10).join('; ') : null,
      ...(status === 'SUCCEEDED'
        ? { advanceCutoffTo: detail.run.windowTo }
        : {}),
    });
  } catch (error) {
    return _input.repository.completeDiscoveryRun({
      id: _input.runId,
      status: 'FAILED',
      counts,
      errorCode: 'DISCOVERY_SOURCE_FAILED',
      errorSummary: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return new Date(fallback);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new OperationsError('INVALID_DISCOVERY_WINDOW', 400);
  }
  return date;
}
