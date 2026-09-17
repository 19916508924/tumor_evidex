import { describe, expect, it, vi } from 'vitest';

import {
  processDiscoveryRun,
  triggerDiscoveryRun,
  type OperationsRepository,
} from '@/shared/services/evidence-platform/operations';
import type {
  DiscoveryRunDto,
  DiscoveryStrategyDto,
} from '@/shared/types/evidence-platform-api';

const strategy: DiscoveryStrategyDto = {
  id: 'strategy-1',
  name: 'NSCLC EGFR L858R',
  version: '1.0.0',
  query: 'EGFR AND L858R',
  associationId: 'association-1',
  status: 'ACTIVE',
  scheduleTimezone: 'Asia/Shanghai',
  scheduleRrule: null,
  overlapDays: 2,
  maxResults: 50,
  lastSuccessfulCutoffAt: '2026-09-10T00:00:00.000Z',
  nextRunAt: null,
  updatedAt: '2026-09-10T00:00:00.000Z',
};

const run: DiscoveryRunDto = {
  id: 'discovery-run-1',
  strategyId: strategy.id,
  triggerType: 'MANUAL',
  triggeredBy: 'reviewer-1',
  workflowVersion: 'pubmed-discovery-v1',
  scopeMode: 'SCOPED',
  scopeSnapshot: {},
  documentLimit: 50,
  estimatedMatchCount: 0,
  uniqueDiscoveredCount: 0,
  processedDocumentCount: 0,
  sourceCursor: null,
  previewHash: null,
  windowFrom: '2026-09-08T00:00:00.000Z',
  windowTo: '2026-09-16T00:00:00.000Z',
  status: 'PENDING',
  counts: {
    discovered: 0,
    duplicate: 0,
    excluded: 0,
    processing: 0,
    readyForReview: 0,
    published: 0,
    failed: 0,
  },
  errorCode: null,
  errorSummary: null,
  startedAt: null,
  completedAt: null,
  pausedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-16T00:00:00.000Z',
};

function repository(): OperationsRepository {
  return {
    getWorkerHealth: vi.fn(),
    getDashboard: vi.fn(),
    listAssociations: vi.fn(),
    listCandidates: vi.fn(),
    getCandidate: vi.fn(),
    listReviewTasks: vi.fn(),
    updateReviewDraft: vi.fn(),
    createDefinitionDraft: vi.fn(),
    updateDefinitionDraft: vi.fn(),
    evaluateDefinitionDraft: vi.fn(),
    activateDefinitionVersion: vi.fn(),
    rollbackDefinitionVersion: vi.fn(),
    listDefinitionAudit: vi.fn(),
    listReleases: vi.fn(),
    getRelease: vi.fn(),
    listDefinitions: vi.fn(),
    listWorkflowRuns: vi.fn(),
    getWorkflowRun: vi.fn(),
    listQuestionRuns: vi.fn(),
    getQuestionRun: vi.fn(),
    listDiscoveryStrategies: vi.fn(),
    getDiscoveryStrategy: vi.fn().mockResolvedValue(strategy),
    setDiscoveryStrategyStatus: vi.fn(),
    createDiscoveryRun: vi.fn().mockResolvedValue({ run, idempotent: false }),
    markDiscoveryRunRunning: vi.fn().mockResolvedValue({
      ...run,
      status: 'RUNNING',
    }),
    completeDiscoveryRun: vi.fn(async (input) => ({
      ...run,
      status: input.status,
      counts: input.counts,
      errorCode: input.errorCode ?? null,
      errorSummary: input.errorSummary ?? null,
    })),
    attachCandidateToStrategy: vi.fn(),
    listDiscoveryRuns: vi.fn(),
    getDiscoveryRun: vi.fn().mockResolvedValue({ run, strategy }),
    retryCandidate: vi.fn(),
  };
}

describe('discovery operations', () => {
  it('builds an overlapped default window and rejects unavailable strategies', async () => {
    const store = repository();
    await triggerDiscoveryRun({
      strategyId: strategy.id,
      actorId: 'reviewer-1',
      repository: store,
      workflowVersion: 'pubmed-discovery-v1',
      now: () => new Date('2026-09-16T00:00:00.000Z'),
    });
    expect(store.createDiscoveryRun).toHaveBeenCalledWith({
      strategyId: strategy.id,
      actorId: 'reviewer-1',
      windowFrom: '2026-09-08T00:00:00.000Z',
      windowTo: '2026-09-16T00:00:00.000Z',
      workflowVersion: 'pubmed-discovery-v1',
    });

    store.getDiscoveryStrategy = vi.fn().mockResolvedValue(null);
    await expect(
      triggerDiscoveryRun({
        strategyId: 'missing',
        actorId: 'reviewer-1',
        repository: store,
        workflowVersion: 'pubmed-discovery-v1',
      })
    ).rejects.toMatchObject({
      code: 'DISCOVERY_STRATEGY_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects paused strategies and invalid discovery windows', async () => {
    const store = repository();
    store.getDiscoveryStrategy = vi
      .fn()
      .mockResolvedValueOnce({ ...strategy, status: 'PAUSED' })
      .mockResolvedValue(strategy)
      .mockResolvedValue(strategy);
    await expect(
      triggerDiscoveryRun({
        strategyId: strategy.id,
        actorId: 'reviewer-1',
        repository: store,
        workflowVersion: 'pubmed-discovery-v1',
      })
    ).rejects.toMatchObject({ code: 'DISCOVERY_STRATEGY_PAUSED', status: 409 });
    await expect(
      triggerDiscoveryRun({
        strategyId: strategy.id,
        actorId: 'reviewer-1',
        from: 'not-a-date',
        repository: store,
        workflowVersion: 'pubmed-discovery-v1',
      })
    ).rejects.toMatchObject({ code: 'INVALID_DISCOVERY_WINDOW', status: 400 });
    await expect(
      triggerDiscoveryRun({
        strategyId: strategy.id,
        actorId: 'reviewer-1',
        from: '2026-09-17T00:00:00.000Z',
        to: '2026-09-16T00:00:00.000Z',
        repository: store,
        workflowVersion: 'pubmed-discovery-v1',
      })
    ).rejects.toMatchObject({ code: 'INVALID_DISCOVERY_WINDOW', status: 400 });
  });

  it('processes new and duplicate PubMed results and advances a successful cutoff', async () => {
    const store = repository();
    const upstream = {
      getAssociationReviewContext: vi.fn().mockResolvedValue({
        id: 'association-1',
        approvedLevel: '1',
        gradingRationale: 'Reviewed.',
        eligibilityTerms: {
          diseases: ['NSCLC'],
          genes: ['EGFR'],
          variants: ['L858R'],
        },
      }),
      findDuplicate: vi
        .fn()
        .mockResolvedValueOnce({ candidateId: 'candidate-existing' })
        .mockResolvedValueOnce(null),
      createCandidateBundle: vi.fn().mockResolvedValue({
        candidateId: 'candidate-new',
        workflowRunId: 'workflow-new',
        draftId: 'draft-new',
        draftVersion: 1,
        reviewTaskId: 'review-new',
        status: 'READY_FOR_REVIEW',
        duplicate: false,
      }),
    };
    const pubmed = {
      previewSearch: vi.fn(),
      searchPage: vi.fn(),
      searchIncremental: vi.fn().mockResolvedValue(['11111111', '22222222']),
      fetchDocument: vi.fn(async (pmid: string) => ({
        pmid,
        title: `EGFR L858R NSCLC study ${pmid}`,
        abstract: 'A study of EGFR L858R in NSCLC.',
        doi: `10.1000/${pmid}`,
        documentHash: `hash-${pmid}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      })),
    };
    const extractionGenerator = {
      generate: vi.fn().mockResolvedValue({
        claims: [
          {
            claimType: 'EFFICACY',
            evidenceMaturity: 'MATURE_CLINICAL',
            studyType: 'trial',
            studyName: null,
            populationSummary: 'NSCLC with EGFR p.L858R',
            sampleSize: 20,
            diseaseStage: null,
            treatmentLine: null,
            priorTherapy: null,
            intervention: 'osimertinib',
            comparator: null,
            endpoint: 'response',
            effectValue: null,
            conclusion: 'The study reported a response.',
            limitations: 'Small study.',
          },
        ],
        qaIssues: [],
      }),
    };
    const result = await processDiscoveryRun({
      runId: run.id,
      repository: store,
      upstreamRepository: upstream,
      pubmed,
      extractionGenerator,
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
    });

    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      counts: { discovered: 2, duplicate: 1, readyForReview: 1, failed: 0 },
    });
    expect(store.attachCandidateToStrategy).toHaveBeenCalledWith(
      'candidate-existing',
      strategy.id
    );
    expect(store.attachCandidateToStrategy).toHaveBeenCalledWith(
      'candidate-new',
      strategy.id
    );
    expect(store.completeDiscoveryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SUCCEEDED',
        advanceCutoffTo: run.windowTo,
      })
    );
  });

  it('persists partial and source-level failures without advancing the cutoff', async () => {
    const partialStore = repository();
    const partial = await processDiscoveryRun({
      runId: run.id,
      repository: partialStore,
      upstreamRepository: {
        getAssociationReviewContext: vi.fn(),
        findDuplicate: vi.fn().mockRejectedValue(new Error('lookup failed')),
        createCandidateBundle: vi.fn(),
      },
      pubmed: {
        previewSearch: vi.fn(),
        searchPage: vi.fn(),
        searchIncremental: vi.fn().mockResolvedValue(['11111111']),
        fetchDocument: vi.fn().mockResolvedValue({
          pmid: '11111111',
          title: 'Study',
          abstract: 'Abstract',
          doi: null,
          documentHash: 'hash',
          url: 'https://pubmed.ncbi.nlm.nih.gov/11111111/',
        }),
      },
      extractionGenerator: { generate: vi.fn() },
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
    });
    expect(partial).toMatchObject({
      status: 'FAILED',
      counts: { discovered: 1, failed: 1, processing: 0 },
      errorCode: 'CANDIDATE_PROCESSING_FAILED',
    });

    const sourceStore = repository();
    const failed = await processDiscoveryRun({
      runId: run.id,
      repository: sourceStore,
      upstreamRepository: {
        getAssociationReviewContext: vi.fn(),
        findDuplicate: vi.fn(),
        createCandidateBundle: vi.fn(),
      },
      pubmed: {
        previewSearch: vi.fn(),
        searchPage: vi.fn(),
        searchIncremental: vi
          .fn()
          .mockRejectedValue(new Error('NCBI unavailable')),
        fetchDocument: vi.fn(),
      },
      extractionGenerator: { generate: vi.fn() },
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
    });
    expect(failed).toMatchObject({
      status: 'FAILED',
      errorCode: 'DISCOVERY_SOURCE_FAILED',
      errorSummary: 'NCBI unavailable',
    });
  });

  it('does not reprocess absent or already-claimed discovery runs', async () => {
    const missingStore = repository();
    missingStore.getDiscoveryRun = vi.fn().mockResolvedValue(null);
    await expect(
      processDiscoveryRun({
        runId: 'missing',
        repository: missingStore,
        upstreamRepository: {} as never,
        pubmed: {} as never,
        extractionGenerator: {} as never,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
      })
    ).resolves.toBeNull();

    const claimedStore = repository();
    claimedStore.markDiscoveryRunRunning = vi.fn().mockResolvedValue(null);
    await expect(
      processDiscoveryRun({
        runId: run.id,
        repository: claimedStore,
        upstreamRepository: {} as never,
        pubmed: {} as never,
        extractionGenerator: {} as never,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
      })
    ).resolves.toEqual(run);
  });
});
