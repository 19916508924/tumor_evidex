import { GET as getAgentAuditRoute } from '@/app/api/internal/v1/agents/[id]/audit/route';
import { POST as activateAgentVersionRoute } from '@/app/api/internal/v1/agents/[id]/versions/[versionId]/activate/route';
import { POST as evaluateAgentVersionRoute } from '@/app/api/internal/v1/agents/[id]/versions/[versionId]/evaluate/route';
import { PATCH as updateAgentVersionRoute } from '@/app/api/internal/v1/agents/[id]/versions/[versionId]/route';
import { POST as createAgentVersionRoute } from '@/app/api/internal/v1/agents/[id]/versions/route';
import {
  GET as listCandidatesRoute,
  POST as submitCandidateRoute,
} from '@/app/api/internal/v1/candidates/route';
import { POST as cancelDiscoveryRunRoute } from '@/app/api/internal/v1/discovery-runs/[id]/cancel/route';
import { POST as pauseDiscoveryRunRoute } from '@/app/api/internal/v1/discovery-runs/[id]/pause/route';
import { POST as resumeDiscoveryRunRoute } from '@/app/api/internal/v1/discovery-runs/[id]/resume/route';
import { POST as previewDiscoveryRunRoute } from '@/app/api/internal/v1/discovery-runs/preview/route';
import { POST as createDiscoveryRunRoute } from '@/app/api/internal/v1/discovery-runs/route';
import { POST as triggerDiscoveryRoute } from '@/app/api/internal/v1/discovery-strategies/[id]/trigger/route';
import { GET as dashboardRoute } from '@/app/api/internal/v1/ops/dashboard/route';
import { POST as decideReviewRoute } from '@/app/api/internal/v1/review-tasks/[id]/decision/route';
import { PATCH as updateReviewDraftRoute } from '@/app/api/internal/v1/review-tasks/[id]/draft/route';
import { GET as getReviewRoute } from '@/app/api/internal/v1/review-tasks/[id]/route';
import { GET as listReviewTasksRoute } from '@/app/api/internal/v1/review-tasks/route';
import { GET as getWorkerHealthRoute } from '@/app/api/internal/v1/worker/health/route';
import { POST as submitFeedbackRoute } from '@/app/api/v1/evidence-questions/[id]/feedback/route';
import { POST as retryQuestionRoute } from '@/app/api/v1/evidence-questions/[id]/retry/route';
import { GET as getQuestionRoute } from '@/app/api/v1/evidence-questions/[id]/route';
import { POST as submitQuestionRoute } from '@/app/api/v1/evidence-questions/route';
import { GET as getDiseaseRoute } from '@/app/api/v1/knowledge/diseases/[id]/route';
import { GET as listDiseasesRoute } from '@/app/api/v1/knowledge/diseases/route';
import { GET as listDrugsRoute } from '@/app/api/v1/knowledge/drugs/route';
import { GET as listGenesRoute } from '@/app/api/v1/knowledge/genes/route';
import { GET as searchRoute } from '@/app/api/v1/knowledge/search/route';
import { GET as summaryRoute } from '@/app/api/v1/knowledge/summary/route';
import { GET as listVariantsRoute } from '@/app/api/v1/knowledge/variants/route';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryMinIntervalStore,
  setMinIntervalStoreForTests,
} from '@/shared/lib/rate-limit';
import { OperationsError } from '@/shared/services/evidence-platform/operations';
import { ReviewDecisionError } from '@/shared/services/evidence-platform/review-publish';

const { getCurrentUserWithPermission, getEvidencePlatformRuntime, platform } =
  vi.hoisted(() => {
    const questionRecords = new Map<string, any>();
    const keys = new Map<string, string>();
    const questionRepository = {
      getPublishedRelease: vi.fn().mockResolvedValue({
        id: 'release-1',
        version: 'v1.0.0',
      }),
      getQuestionEntityCatalog: vi.fn().mockResolvedValue({
        diseases: [
          {
            canonicalName: 'NSCLC',
            displayNameZh: '非小细胞肺癌',
            displayNameEn: 'Non-small cell lung cancer',
            aliases: [],
          },
        ],
        genes: [
          {
            id: 'gene-egfr',
            symbol: 'EGFR',
            name: 'epidermal growth factor receptor',
            aliases: [],
          },
        ],
        variants: [
          {
            geneId: 'gene-egfr',
            alterationType: 'SNV',
            hgvsp: 'p.L858R',
            canonicalKey: 'EGFR:L858R',
            aliases: ['L858R'],
          },
        ],
        drugs: [],
      }),
      findByIdempotencyKey: vi.fn(async (key: string) => {
        const id = keys.get(key);
        return id ? questionRecords.get(id) : null;
      }),
      create: vi.fn(async (record: any) => {
        questionRecords.set(record.id, record);
        keys.set(record.idempotencyKey, record.id);
        return record;
      }),
      get: vi.fn(async (id: string) => questionRecords.get(id) ?? null),
      markRunning: vi.fn(),
      complete: vi.fn(),
      recordTrace: vi.fn(),
      requeue: vi.fn().mockResolvedValue({
        run: { id: 'question-1', status: 'PENDING' },
        requeued: true,
      }),
      createFeedback: vi.fn().mockResolvedValue({
        id: 'feedback-1',
        questionRunId: 'question-1',
        answerVersion: 'answer-1',
        knowledgeRelease: 'v1.0.0',
        category: 'HELPFUL',
        createdAt: '2026-09-16T00:00:00.000Z',
        idempotent: false,
      }),
    };
    const platform = {
      catalogRepository: {
        getRelease: vi.fn().mockResolvedValue({
          id: 'release-1',
          version: 'v1.0.0',
          literatureCutoffAt: '2026-09-01T00:00:00.000Z',
          regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
          publishedAt: '2026-09-16T00:00:00.000Z',
        }),
        countPublished: vi.fn().mockResolvedValue({
          diseases: 2,
          genes: 2,
          variants: 5,
          drugs: 9,
          associations: 13,
          claims: 20,
          sources: 22,
        }),
        searchPublished: vi.fn().mockResolvedValue([
          {
            id: 'gene-egfr',
            type: 'gene',
            canonicalName: 'EGFR',
            displayNameZh: 'EGFR',
            displayNameEn: 'EGFR',
            aliases: ['ERBB1'],
          },
        ]),
        listRecentReleases: vi.fn().mockResolvedValue([
          {
            id: 'release-1',
            version: 'v1.0.0',
            literatureCutoffAt: '2026-09-01T00:00:00.000Z',
            regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
            gradingRuleVersion: 'evidex-therapeutic-v1',
            publishedAt: '2026-09-16T00:00:00.000Z',
          },
        ]),
        getEntityDetail: vi.fn().mockResolvedValue({
          release: {
            id: 'release-1',
            version: 'v1.0.0',
            literatureCutoffAt: '2026-09-01T00:00:00.000Z',
            regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
            publishedAt: '2026-09-16T00:00:00.000Z',
          },
          entity: {
            id: 'disease-nsclc',
            type: 'disease',
            canonicalName: 'NSCLC',
            displayNameZh: '非小细胞肺癌',
            displayNameEn: 'Non-small cell lung cancer',
            aliases: [],
          },
          associations: [],
          related: { diseases: [], genes: [], variants: [], drugs: [] },
        }),
        getEvidenceDetail: vi.fn(),
        getSourceDetail: vi.fn(),
      },
      upstreamRepository: {
        getAssociationReviewContext: vi.fn().mockResolvedValue({
          id: 'assoc-1',
          approvedLevel: '1',
          gradingRationale: 'Reviewed association.',
          eligibilityTerms: {
            diseases: ['NSCLC'],
            genes: ['EGFR'],
            variants: ['p.L858R'],
          },
        }),
        findDuplicate: vi.fn().mockResolvedValue(null),
        createCandidateBundle: vi.fn(async ({ ids }: any) => ({
          ...ids,
          draftVersion: 1,
          status: 'READY_FOR_REVIEW',
          duplicate: false,
        })),
        createCandidateOutcome: vi.fn(async ({ status }: any) => ({
          candidateId: 'candidate-excluded',
          workflowRunId: 'workflow-excluded',
          status,
        })),
      },
      reviewRepository: {
        findDecision: vi.fn().mockResolvedValue(null),
        getReviewTask: vi.fn().mockResolvedValue({
          id: 'review-1',
          status: 'READY_FOR_REVIEW',
          draftId: 'draft-1',
          draftVersion: 1,
          hasBlockingIssues: false,
          publishedReleaseId: null,
          candidate: {
            id: 'candidate-1',
            sourceType: 'PUBMED',
            externalId: '12345678',
            title: 'Evidence title',
            journal: 'Evidence Journal',
            publicationDate: '2026-09-15',
            doi: '10.1000/evidence',
            sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
          },
          draft: { associationId: 'assoc-1' },
          publicationPreview: {
            currentApprovedLevel: '1',
            currentGradingRationale: 'Current release rationale.',
            proposedApprovedLevel: '3A',
            proposedGradingRationale: 'Reviewer-proposed rationale.',
            levelChanged: true,
            newClaimCount: 1,
            modifiedClaimCount: 0,
            source: {
              sourceType: 'PUBMED',
              externalId: '12345678',
              sourceScope: 'ABSTRACT',
            },
            currentRelease: { id: 'release-1', version: 'v1.0.0' },
            expectedNextRelease: 'v1.0.1',
          },
        }),
        saveNonPublishDecision: vi.fn(),
        publishApprovedReview: vi.fn().mockResolvedValue({
          reviewTaskId: 'review-1',
          decision: 'APPROVE_AND_PUBLISH',
          status: 'PUBLISHED',
          releaseId: 'release-2',
          releaseVersion: 'v1.0.1',
          idempotent: false,
        }),
      },
      questionDependencies: {
        repository: questionRepository,
        getAnswerDependencies: vi.fn(),
        createId: () => 'question-1',
        now: () => new Date('2026-09-16T00:00:00.000Z'),
      },
      pubmed: {
        previewSearch: vi.fn().mockResolvedValue({ count: 12 }),
        searchPage: vi.fn(),
        searchIncremental: vi.fn(),
        fetchDocument: vi.fn().mockResolvedValue({
          pmid: '12345678',
          title: 'EGFR evidence in NSCLC',
          abstract: 'EGFR p.L858R was evaluated in NSCLC.',
          doi: '10.1000/evidence',
          documentHash: 'document-hash',
          publicationDate: '2026-09-15',
          journal: 'Evidence Journal',
          url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
        }),
      },
      civic: {
        previewSearch: vi.fn().mockResolvedValue({ count: 4 }),
        searchPage: vi.fn(),
      },
      operationsRepository: {
        getWorkerHealth: vi.fn().mockResolvedValue({
          status: 'HEALTHY',
          liveWorkerCount: 1,
          backlog: { queued: 0, running: 0, retryWaiting: 0, deadLetter: 0 },
        }),
        getDashboard: vi.fn().mockResolvedValue({
          range: '7d',
          counts: {
            discovered: 2,
            duplicate: 0,
            excluded: 0,
            processing: 0,
            readyForReview: 1,
            published: 1,
            failed: 0,
          },
          backlog: { reviewTasks: 1, oldestWaitingSince: null },
          workflow: {
            total: 2,
            failed: 0,
            needsHuman: 0,
            retries: 0,
            failureRate: 0,
          },
          latestDiscoveryRun: null,
          latestRelease: null,
          alerts: [],
        }),
        listCandidates: vi.fn().mockResolvedValue({
          items: [{ id: 'candidate-1', status: 'READY_FOR_REVIEW' }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
        listReviewTasks: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'review-1',
              waitingHours: 80,
              disease: { id: 'disease-nsclc', name: 'NSCLC' },
              gene: { id: 'gene-egfr', symbol: 'EGFR' },
              variant: { id: 'variant-l858r', hgvsp: 'p.L858R' },
              risk: 'HIGH',
              hasBlockingIssues: true,
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
        updateReviewDraft: vi.fn(),
        createDefinitionDraft: vi.fn().mockResolvedValue({
          id: 'answer-agent@1.1.0',
          agentId: 'answer-agent',
          version: '1.1.0',
          status: 'DRAFT',
        }),
        updateDefinitionDraft: vi.fn().mockResolvedValue({
          id: 'answer-agent@1.1.0',
          status: 'DRAFT',
        }),
        evaluateDefinitionDraft: vi.fn().mockResolvedValue({
          versionId: 'answer-agent@1.1.0',
          status: 'PASSED',
          checks: [],
        }),
        activateDefinitionVersion: vi.fn().mockResolvedValue({
          id: 'answer-agent@1.1.0',
          status: 'ACTIVE',
        }),
        rollbackDefinitionVersion: vi.fn(),
        listDefinitionAudit: vi.fn().mockResolvedValue({
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
        getDiscoveryStrategy: vi.fn().mockResolvedValue({
          id: 'strategy-1',
          name: 'NSCLC EGFR',
          version: '1.0.0',
          query: 'EGFR AND NSCLC',
          associationId: 'assoc-1',
          status: 'ACTIVE',
          scheduleTimezone: 'Asia/Shanghai',
          scheduleRrule: null,
          overlapDays: 7,
          maxResults: 100,
          lastSuccessfulCutoffAt: null,
          nextRunAt: null,
          updatedAt: '2026-09-16T00:00:00.000Z',
        }),
        createDiscoveryRun: vi.fn().mockResolvedValue({
          run: {
            id: 'discovery-run-1',
            strategyId: 'strategy-1',
            triggerType: 'MANUAL',
            triggeredBy: 'server-session-user',
            workflowVersion: 'pubmed-discovery-v1',
            windowFrom: '2026-09-09T00:00:00.000Z',
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
            createdAt: '2026-09-16T00:00:00.000Z',
          },
          idempotent: false,
        }),
        getDiscoveryRun: vi.fn(),
      },
      discoveryRepository: {
        resolveDiscoveryScope: vi.fn().mockResolvedValue({
          snapshot: {
            mode: 'SCOPED',
            diseaseIds: ['disease-nsclc'],
            geneIds: ['gene-egfr'],
            variantIds: [],
            aliasVersion: 'catalog-v1',
            knowledgeReleaseId: 'release-1',
            knowledgeReleaseVersion: 'v1.0.0',
          },
          queries: [
            {
              strategyId: 'strategy-1',
              strategyVersion: '1.0.0',
              associationId: 'assoc-1',
              query: 'EGFR AND NSCLC',
              label: 'NSCLC · EGFR',
            },
          ],
          lastSuccessfulCutoffAt: null,
          overlapDays: 7,
        }),
        createManualDiscoveryRun: vi.fn().mockResolvedValue({
          run: { id: 'discovery-run-v2', status: 'PENDING' },
          idempotent: false,
        }),
        transitionDiscoveryRun: vi.fn().mockImplementation(({ action }) => ({
          id: 'discovery-run-v2',
          status:
            action === 'pause'
              ? 'PAUSED'
              : action === 'cancel'
                ? 'CANCELLED'
                : 'PENDING',
        })),
      },
      previewSigningSecret: 'integration-preview-secret',
      extractionGenerator: {
        generate: vi.fn().mockResolvedValue({
          claims: [
            {
              claimType: 'EFFICACY',
              evidenceMaturity: 'MATURE_CLINICAL',
              studyType: 'trial',
              studyName: null,
              populationSummary: 'NSCLC',
              sampleSize: 10,
              diseaseStage: null,
              treatmentLine: null,
              priorTherapy: null,
              intervention: 'osimertinib',
              comparator: null,
              endpoint: 'PFS',
              effectValue: null,
              conclusion: 'Result.',
              limitations: 'Small sample.',
            },
          ],
          qaIssues: [],
        }),
      },
      schedule: vi.fn(),
    };
    return {
      getCurrentUserWithPermission: vi.fn(),
      getEvidencePlatformRuntime: vi.fn(() => platform),
      platform,
    };
  });

vi.mock('@/core/rbac', () => ({
  getCurrentUserWithPermission,
  PERMISSIONS: { ADMIN_ACCESS: 'admin.access' },
}));

vi.mock('@/shared/services/evidence-platform/runtime', () => ({
  getEvidencePlatformRuntime,
}));

function request(
  url: string,
  body?: unknown,
  headers?: Record<string, string>,
  method?: string
) {
  return new Request(url, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const draft = {
  associationId: 'assoc-1',
  proposedLevel: '1',
  gradingRationale: 'Requires review.',
  passages: [
    {
      id: 'passage-1',
      text: 'Primary result.',
      textHash: 'passage-hash',
      section: 'Abstract',
      paragraphIndex: 0,
      displayPolicy: 'EXCERPT',
      modelUsePolicy: 'ALLOWED',
      supportRole: 'PRIMARY',
    },
  ],
  claims: [
    {
      id: 'claim-1',
      claimType: 'EFFICACY',
      evidenceMaturity: 'MATURE_CLINICAL',
      studyType: 'trial',
      studyName: null,
      populationSummary: 'NSCLC',
      sampleSize: 10,
      diseaseStage: null,
      treatmentLine: null,
      priorTherapy: null,
      intervention: 'osimertinib',
      comparator: null,
      endpoint: 'PFS',
      effectValue: null,
      conclusion: 'Result.',
      limitations: 'Small sample.',
      passageIds: ['passage-1'],
    },
  ],
  fieldProvenance: { endpoint: ['passage-1'] },
  qaIssues: [],
};

describe('Agent platform HTTP routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMinIntervalStoreForTests(createMemoryMinIntervalStore());
    getCurrentUserWithPermission.mockResolvedValue({
      id: 'server-session-user',
      email: 'reviewer@example.com',
      name: 'Reviewer',
    });
  });

  it('serves release-locked catalog summary and search', async () => {
    const summary = await summaryRoute(
      request('http://localhost/api/v1/knowledge/summary?release=v1.0.0')
    );
    expect(summary.status).toBe(200);
    expect(await summary.json()).toMatchObject({
      code: 0,
      data: { release: { version: 'v1.0.0' }, counts: { claims: 20 } },
    });

    const search = await searchRoute(
      request(
        'http://localhost/api/v1/knowledge/search?q=EGFR&type=gene&page=1&pageSize=20'
      )
    );
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({
      code: 0,
      data: { items: [{ id: 'gene-egfr' }] },
    });

    for (const route of [
      listDiseasesRoute,
      listGenesRoute,
      listVariantsRoute,
      listDrugsRoute,
    ]) {
      const list = await route(
        request('http://localhost/api/v1/knowledge/entities?page=1&pageSize=20')
      );
      expect(list.status).toBe(200);
    }
  });

  it('serves a release-locked entity detail and returns a stable 404', async () => {
    const detail = await getDiseaseRoute(request('http://localhost'), {
      params: Promise.resolve({ id: 'disease-nsclc' }),
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      code: 0,
      data: {
        release: { version: 'v1.0.0' },
        entity: { id: 'disease-nsclc', type: 'disease' },
      },
    });

    platform.catalogRepository.getEntityDetail.mockResolvedValueOnce(null);
    const missing = await getDiseaseRoute(request('http://localhost'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      code: -1,
      message: 'KNOWLEDGE_ENTITY_NOT_FOUND',
      details: { id: 'missing', type: 'disease' },
    });
  });

  it('creates a recoverable queued Question Run without process-local scheduling', async () => {
    const response = await (
      submitQuestionRoute as (request: Request) => Promise<Response>
    )(
      request(
        'http://localhost/api/v1/evidence-questions',
        {
          question: 'NSCLC 的 EGFR p.L858R 有哪些证据？',
          locale: 'zh-CN',
        },
        { 'idempotency-key': 'question-request-1' }
      )
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: {
        questionRunId: 'question-1',
        status: 'PENDING',
        pollAfterMs: 1000,
      },
    });
    expect(platform.schedule).not.toHaveBeenCalled();

    const getResponse = await (
      getQuestionRoute as (
        request: Request,
        context: { params: Promise<{ id: string }> }
      ) => Promise<Response>
    )(request('http://localhost'), {
      params: Promise.resolve({ id: 'question-1' }),
    });
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({
      data: {
        id: 'question-1',
        status: 'PENDING',
        disclaimer: expect.stringContaining('不构成医疗建议'),
        disclaimerEn: expect.stringContaining('Not medical advice'),
      },
    });
  });

  it('rate-limits repeated public question submissions by request identity', async () => {
    const first = await submitQuestionRoute(
      request(
        'http://localhost/api/v1/evidence-questions',
        {
          question: 'NSCLC 的 EGFR p.L858R 有哪些证据？',
          locale: 'zh-CN',
        },
        { 'idempotency-key': 'rate-limit-1', 'x-forwarded-for': '203.0.113.10' }
      )
    );
    const second = await submitQuestionRoute(
      request(
        'http://localhost/api/v1/evidence-questions',
        {
          question: 'NSCLC 的 EGFR p.L858R 有哪些证据？',
          locale: 'zh-CN',
        },
        { 'idempotency-key': 'rate-limit-2', 'x-forwarded-for': '203.0.113.10' }
      )
    );
    expect(first.status).toBe(202);
    expect(second.status).toBe(429);
  });

  it('accepts terminal Question Run feedback and rejects feedback while pending', async () => {
    platform.questionDependencies.repository.get.mockResolvedValueOnce({
      id: 'question-1',
      status: 'ANSWERED',
    });
    const accepted = await submitFeedbackRoute(
      request(
        'http://localhost/api/v1/evidence-questions/question-1/feedback',
        { category: 'HELPFUL', comment: '引用清楚' },
        { 'idempotency-key': 'feedback-request-1' }
      ),
      { params: Promise.resolve({ id: 'question-1' }) }
    );
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toMatchObject({
      code: 0,
      data: { id: 'feedback-1', category: 'HELPFUL' },
    });

    platform.questionDependencies.repository.get.mockResolvedValueOnce({
      id: 'question-2',
      status: 'PENDING',
    });
    const pending = await submitFeedbackRoute(
      request(
        'http://localhost/api/v1/evidence-questions/question-2/feedback',
        { category: 'NOT_HELPFUL' },
        {
          'idempotency-key': 'feedback-request-2',
          'x-forwarded-for': '203.0.113.20',
        }
      ),
      { params: Promise.resolve({ id: 'question-2' }) }
    );
    expect(pending.status).toBe(409);
    expect(await pending.json()).toEqual({
      code: -1,
      message: 'QUESTION_RUN_NOT_COMPLETED',
    });
  });

  it('requeues an existing failed Question Run for the public frontend', async () => {
    const response = await retryQuestionRoute(
      request(
        'http://localhost/api/v1/evidence-questions/question-1/retry',
        {},
        { 'x-forwarded-for': '203.0.113.30' }
      ),
      { params: Promise.resolve({ id: 'question-1' }) }
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      code: 0,
      message: 'ok',
      data: {
        questionRunId: 'question-1',
        status: 'PENDING',
        pollAfterMs: 1000,
        idempotent: false,
      },
    });
    expect(
      platform.questionDependencies.repository.requeue
    ).toHaveBeenCalledWith('question-1');
  });

  it('serves authenticated Ops dashboard and paginated candidate data', async () => {
    const dashboard = await dashboardRoute(
      request('http://localhost/api/internal/v1/ops/dashboard?range=7d')
    );
    expect(dashboard.status).toBe(200);
    expect(await dashboard.json()).toMatchObject({
      data: { range: '7d', backlog: { reviewTasks: 1 } },
    });

    const candidates = await listCandidatesRoute(
      request(
        'http://localhost/api/internal/v1/candidates?page=1&pageSize=20&status=READY_FOR_REVIEW'
      )
    );
    expect(candidates.status).toBe(200);
    expect(await candidates.json()).toMatchObject({
      data: {
        items: [{ id: 'candidate-1' }],
        pagination: { total: 1 },
      },
    });
  });

  it('rejects unsupported dashboard ranges and malformed review JSON', async () => {
    const range = await dashboardRoute(
      request('http://localhost/api/internal/v1/ops/dashboard?range=90d')
    );
    expect(range.status).toBe(400);
    expect(await range.json()).toEqual({
      code: -1,
      message: 'INVALID_DASHBOARD_RANGE',
    });

    const draft = await updateReviewDraftRoute(
      new Request(
        'http://localhost/api/internal/v1/review-tasks/review-1/draft',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }
      ),
      { params: Promise.resolve({ id: 'review-1' }) }
    );
    expect(draft.status).toBe(400);
    expect(await draft.json()).toEqual({ code: -1, message: 'INVALID_INPUT' });
    expect(
      platform.operationsRepository.updateReviewDraft
    ).not.toHaveBeenCalled();
  });

  it('rejects unknown review draft fields instead of silently dropping edits', async () => {
    const response = await updateReviewDraftRoute(
      request(
        'http://localhost/api/internal/v1/review-tasks/review-1/draft',
        {
          expectedDraftVersion: 1,
          reason: 'Reviewer edit.',
          draft: { ...draft, conclusion: 'This field is in the wrong place.' },
        },
        undefined,
        'PATCH'
      ),
      { params: Promise.resolve({ id: 'review-1' }) }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: -1,
      message: 'INVALID_EVIDENCE_DRAFT',
    });
    expect(
      platform.operationsRepository.updateReviewDraft
    ).not.toHaveBeenCalled();
  });

  it('passes typed review queue filters and rejects invalid filter values', async () => {
    const response = await listReviewTasksRoute(
      request(
        'http://localhost/api/internal/v1/review-tasks?waitingAge=72h&diseaseId=disease-nsclc&geneId=gene-egfr&variantId=variant-l858r&risk=HIGH&blocking=true'
      )
    );
    expect(response.status).toBe(200);
    expect(platform.operationsRepository.listReviewTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        waitingAge: '72h',
        diseaseId: 'disease-nsclc',
        geneId: 'gene-egfr',
        variantId: 'variant-l858r',
        risk: 'HIGH',
        blocking: true,
      })
    );

    const invalid = await listReviewTasksRoute(
      request(
        'http://localhost/api/internal/v1/review-tasks?waitingAge=forever&blocking=sometimes'
      )
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      code: -1,
      message: 'INVALID_REVIEW_FILTER',
    });
  });

  it('rejects malformed discovery trigger JSON as invalid input', async () => {
    const response = await triggerDiscoveryRoute(
      new Request(
        'http://localhost/api/internal/v1/discovery-strategies/strategy-1/trigger',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }
      ),
      { params: Promise.resolve({ id: 'strategy-1' }) }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'INVALID_INPUT',
    });
  });

  it('previews, creates, and controls a durable manual Discovery Run', async () => {
    const previewResponse = await previewDiscoveryRunRoute(
      request('http://localhost/api/internal/v1/discovery-runs/preview', {
        scope: {
          mode: 'SCOPED',
          diseaseIds: ['disease-nsclc'],
          geneIds: ['gene-egfr'],
          variantIds: [],
        },
        documentLimit: 50,
        window: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-16T00:00:00.000Z',
        },
      })
    );
    expect(previewResponse.status).toBe(200);
    const previewBody = await previewResponse.json();
    expect(previewBody).toMatchObject({
      code: 0,
      data: {
        estimatedMatchCount: 12,
        documentLimit: 50,
        previewToken: expect.any(String),
      },
    });
    expect(
      platform.discoveryRepository.createManualDiscoveryRun
    ).not.toHaveBeenCalled();

    const createResponse = await createDiscoveryRunRoute(
      request('http://localhost/api/internal/v1/discovery-runs', {
        previewToken: previewBody.data.previewToken,
        idempotencyKey: 'manual-discovery-1',
      })
    );
    expect(createResponse.status).toBe(202);
    expect(await createResponse.json()).toMatchObject({
      data: { run: { id: 'discovery-run-v2', status: 'PENDING' } },
    });

    for (const [route, action, status] of [
      [pauseDiscoveryRunRoute, 'pause', 'PAUSED'],
      [resumeDiscoveryRunRoute, 'resume', 'PENDING'],
      [cancelDiscoveryRunRoute, 'cancel', 'CANCELLED'],
    ] as const) {
      const response = await route(request('http://localhost'), {
        params: Promise.resolve({ id: 'discovery-run-v2' }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { status } });
      expect(
        platform.discoveryRepository.transitionDiscoveryRun
      ).toHaveBeenCalledWith({
        runId: 'discovery-run-v2',
        action,
        actorId: 'server-session-user',
      });
    }
  });

  it('accepts CIViC as an explicit discovery source and preserves it in the preview', async () => {
    const scope = {
      mode: 'SCOPED' as const,
      diseaseIds: ['disease-nsclc'],
      geneIds: ['gene-egfr'],
      variantIds: [],
    };
    const response = await previewDiscoveryRunRoute(
      request('http://localhost/api/internal/v1/discovery-runs/preview', {
        source: 'CIVIC',
        scope,
        documentLimit: 50,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      data: {
        estimatedMatchCount: 4,
        snapshot: { source: 'CIVIC' },
      },
    });
    expect(
      platform.discoveryRepository.resolveDiscoveryScope
    ).toHaveBeenCalledWith(scope, 'CIVIC');
    expect(platform.civic.previewSearch).toHaveBeenCalledTimes(1);
  });

  it('retires the request-lifetime strategy trigger in favor of Preview', async () => {
    const response = await triggerDiscoveryRoute(
      request(
        'http://localhost/api/internal/v1/discovery-strategies/strategy-1/trigger',
        {}
      ),
      { params: Promise.resolve({ id: 'strategy-1' }) }
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      code: -1,
      message: 'USE_DISCOVERY_RUN_PREVIEW',
    });
    expect(platform.schedule).not.toHaveBeenCalled();
  });

  it('blocks cross-origin internal mutations before external work', async () => {
    const response = await submitCandidateRoute(
      request(
        'http://localhost/api/internal/v1/candidates',
        { pmid: '12345678', associationId: 'assoc-1' },
        { origin: 'https://attacker.example' }
      )
    );
    expect(response.status).toBe(403);
    expect(platform.pubmed.fetchDocument).not.toHaveBeenCalled();
  });

  it('blocks unauthenticated candidate writes before calling PubMed', async () => {
    getCurrentUserWithPermission.mockResolvedValue(null);
    const response = await (
      submitCandidateRoute as (request: Request) => Promise<Response>
    )(
      request('http://localhost/api/internal/v1/candidates', {
        pmid: '12345678',
        associationId: 'assoc-1',
      })
    );
    expect(response.status).toBe(401);
    expect(platform.pubmed.fetchDocument).not.toHaveBeenCalled();
  });

  it('fetches PubMed server-side and creates only a review draft', async () => {
    const response = await (
      submitCandidateRoute as (request: Request) => Promise<Response>
    )(
      request('http://localhost/api/internal/v1/candidates', {
        pmid: '12345678',
        associationId: 'assoc-1',
      })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { status: 'READY_FOR_REVIEW', draftVersion: 1 },
    });
    expect(platform.pubmed.fetchDocument).toHaveBeenCalledWith('12345678');
    expect(platform.extractionGenerator.generate).toHaveBeenCalledTimes(1);
    expect(
      platform.upstreamRepository.createCandidateBundle
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowVersion: 'single-pubmed-v3',
        skillTraces: expect.arrayContaining([
          expect.objectContaining({
            agentId: 'eligibility-agent',
            skillId: 'screen_evidence_eligibility',
          }),
        ]),
      })
    );
    expect(
      platform.reviewRepository.publishApprovedReview
    ).not.toHaveBeenCalled();
  });

  it('persists an ineligible manual PMID without invoking extraction', async () => {
    platform.pubmed.fetchDocument.mockResolvedValueOnce({
      pmid: '87654321',
      title: 'Unrelated hematology study',
      abstract: 'A study of lymphoma without the configured target entities.',
      doi: null,
      documentHash: 'excluded-document-hash',
      publicationDate: '2026-09-15',
      journal: 'Evidence Journal',
      url: 'https://pubmed.ncbi.nlm.nih.gov/87654321/',
    });

    const response = await submitCandidateRoute(
      request('http://localhost/api/internal/v1/candidates', {
        pmid: '87654321',
        associationId: 'assoc-1',
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: { candidateId: 'candidate-excluded', status: 'EXCLUDED' },
    });
    expect(
      platform.upstreamRepository.createCandidateOutcome
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        associationId: 'assoc-1',
        workflowVersion: 'single-pubmed-v3',
        status: 'EXCLUDED',
        reason: expect.objectContaining({
          code: 'TARGET_ENTITIES_NOT_FOUND',
          stage: 'screen_evidence_eligibility',
        }),
        skillTraces: [
          expect.objectContaining({ skillId: 'screen_evidence_eligibility' }),
        ],
      })
    );
    expect(platform.extractionGenerator.generate).not.toHaveBeenCalled();
    expect(
      platform.upstreamRepository.createCandidateBundle
    ).not.toHaveBeenCalled();
  });

  it('deduplicates the PubMed document before spending an extraction call', async () => {
    platform.upstreamRepository.findDuplicate.mockResolvedValueOnce({
      candidateId: 'candidate-existing',
      workflowRunId: 'workflow-existing',
      draftId: 'draft-existing',
      draftVersion: 1,
      reviewTaskId: 'review-existing',
      status: 'READY_FOR_REVIEW',
      duplicate: false,
    });
    const response = await submitCandidateRoute(
      request('http://localhost/api/internal/v1/candidates', {
        pmid: '12345678',
        associationId: 'assoc-1',
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { candidateId: 'candidate-existing', duplicate: true },
    });
    expect(platform.extractionGenerator.generate).not.toHaveBeenCalled();
  });

  it('takes the reviewer identity from the authenticated session', async () => {
    const detail = await getReviewRoute(request('http://localhost'), {
      params: Promise.resolve({ id: 'review-1' }),
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      data: {
        id: 'review-1',
        candidate: { externalId: '12345678' },
        draft: { associationId: 'assoc-1' },
        publicationPreview: {
          currentApprovedLevel: '1',
          proposedApprovedLevel: '3A',
          levelChanged: true,
          newClaimCount: 1,
          modifiedClaimCount: 0,
          currentRelease: { version: 'v1.0.0' },
          expectedNextRelease: 'v1.0.1',
        },
      },
    });

    const response = await (
      decideReviewRoute as (
        request: Request,
        context: { params: Promise<{ id: string }> }
      ) => Promise<Response>
    )(
      request(
        'http://localhost/api/internal/v1/review-tasks/review-1/decision',
        {
          decision: 'APPROVE_AND_PUBLISH',
          expectedDraftVersion: 1,
          comment: 'Checked.',
          idempotencyKey: 'review-1:1:approve',
        }
      ),
      { params: Promise.resolve({ id: 'review-1' }) }
    );
    expect(response.status).toBe(200);
    expect(
      platform.reviewRepository.publishApprovedReview
    ).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'server-session-user' })
    );
  });

  it('rejects an approval with a blank reviewer comment at the API boundary', async () => {
    const response = await decideReviewRoute(
      request(
        'http://localhost/api/internal/v1/review-tasks/review-1/decision',
        {
          decision: 'APPROVE_AND_PUBLISH',
          expectedDraftVersion: 1,
          comment: '   ',
          idempotencyKey: 'review-1:1:blank-comment',
        }
      ),
      { params: Promise.resolve({ id: 'review-1' }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'INVALID_INPUT',
    });
    expect(
      platform.reviewRepository.publishApprovedReview
    ).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent reviewer already changed the task state', async () => {
    platform.reviewRepository.publishApprovedReview.mockRejectedValueOnce(
      new ReviewDecisionError(
        'INVALID_REVIEW_STATE',
        'Review task review-1 is PUBLISHED'
      )
    );

    const response = await decideReviewRoute(
      request(
        'http://localhost/api/internal/v1/review-tasks/review-1/decision',
        {
          decision: 'APPROVE_AND_PUBLISH',
          expectedDraftVersion: 1,
          comment: 'Checked in another browser tab.',
          idempotencyKey: 'review-1:1:concurrent-approve',
        }
      ),
      { params: Promise.resolve({ id: 'review-1' }) }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'INVALID_REVIEW_STATE',
    });
  });

  it('exposes controlled Agent draft, evaluation, activation and audit routes', async () => {
    const definitionContext = {
      params: Promise.resolve({ id: 'answer-agent' }),
    };
    const created = await createAgentVersionRoute(
      request('http://localhost/api/internal/v1/agents/answer-agent/versions', {
        sourceVersionId: 'answer-agent@1.0.0',
        version: '1.1.0',
      }),
      definitionContext
    );
    expect(created.status).toBe(201);
    expect(
      platform.operationsRepository.createDefinitionDraft
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'agents',
        definitionId: 'answer-agent',
        actorId: 'server-session-user',
      })
    );

    const versionContext = {
      params: Promise.resolve({
        id: 'answer-agent',
        versionId: 'answer-agent@1.1.0',
      }),
    };
    const updated = await updateAgentVersionRoute(
      request(
        'http://localhost/api/internal/v1/agents/answer-agent/versions/answer-agent%401.1.0',
        { patch: { goal: 'Updated governed goal' } },
        undefined,
        'PATCH'
      ),
      versionContext
    );
    expect(updated.status).toBe(200);
    expect(
      platform.operationsRepository.updateDefinitionDraft
    ).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { goal: 'Updated governed goal' } })
    );

    expect(
      (
        await evaluateAgentVersionRoute(
          request('http://localhost/evaluate', {}),
          versionContext
        )
      ).status
    ).toBe(200);
    expect(
      (
        await activateAgentVersionRoute(
          request('http://localhost/activate', {}),
          versionContext
        )
      ).status
    ).toBe(200);
    expect(
      (
        await getAgentAuditRoute(
          request('http://localhost/audit?page=1&pageSize=20'),
          definitionContext
        )
      ).status
    ).toBe(200);
  });

  it('returns 422 for unknown version-management input and 409 for immutable versions', async () => {
    const invalid = await createAgentVersionRoute(
      request('http://localhost/versions', {
        sourceVersionId: 'answer-agent@1.0.0',
        version: '1.1.0',
        arbitrary: true,
      }),
      { params: Promise.resolve({ id: 'answer-agent' }) }
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      message: 'INVALID_DEFINITION_INPUT',
    });

    platform.operationsRepository.updateDefinitionDraft.mockRejectedValueOnce(
      new OperationsError('ACTIVE_DEFINITION_IMMUTABLE', 409)
    );
    const conflict = await updateAgentVersionRoute(
      request(
        'http://localhost/version',
        { patch: { goal: 'Not allowed' } },
        undefined,
        'PATCH'
      ),
      {
        params: Promise.resolve({
          id: 'answer-agent',
          versionId: 'answer-agent@1.0.0',
        }),
      }
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      message: 'ACTIVE_DEFINITION_IMMUTABLE',
    });
  });

  it('returns authenticated worker heartbeat and backlog health', async () => {
    const response = await getWorkerHealthRoute(
      request('http://localhost/api/internal/v1/worker/health')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { status: 'HEALTHY', liveWorkerCount: 1 },
    });
  });
});
