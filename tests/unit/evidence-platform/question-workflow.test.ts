import { describe, expect, it, vi } from 'vitest';

import {
  createQuestionFeedback,
  processEvidenceQuestionRun,
  retryEvidenceQuestionRun,
  submitEvidenceQuestion,
  type QuestionRunRecord,
  type QuestionRunRepository,
  type QuestionWorkflowDependencies,
} from '@/shared/services/evidence-platform/question-workflow';
import type { EvidenceAnswerDependencies } from '@/shared/services/evidence/answer-evidence-query';

const release = { id: 'release-1', version: 'v1.0.0' };
const entityCatalog = {
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
};

function stores(): {
  repository: QuestionRunRepository;
  records: Map<string, QuestionRunRecord>;
} {
  const records = new Map<string, QuestionRunRecord>();
  const keys = new Map<string, string>();
  return {
    records,
    repository: {
      getPublishedRelease: vi.fn().mockResolvedValue(release),
      getQuestionEntityCatalog: vi.fn().mockResolvedValue(entityCatalog),
      findByIdempotencyKey: vi.fn(async (key) => {
        const id = keys.get(key);
        return id ? records.get(id)! : null;
      }),
      create: vi.fn(async (input) => {
        records.set(input.id, input);
        keys.set(input.idempotencyKey, input.id);
        return input;
      }),
      get: vi.fn(async (id) => records.get(id) ?? null),
      markRunning: vi.fn(async (id) => {
        const record = records.get(id);
        if (!record || record.status !== 'PENDING') return null;
        const running = { ...record, status: 'RUNNING' as const };
        records.set(id, running);
        return running;
      }),
      complete: vi.fn(async (input) => {
        const record = records.get(input.id)!;
        const complete = {
          ...record,
          status: input.status,
          publicResult: input.publicResult,
          errorCode: input.errorCode ?? null,
          completedAt: input.completedAt,
        };
        records.set(input.id, complete);
        return complete;
      }),
      recordTrace: vi.fn(),
      requeue: vi.fn(async (id) => {
        const record = records.get(id);
        if (!record) return null;
        if (!['FAILED', 'SUMMARY_UNAVAILABLE'].includes(record.status)) {
          return { run: record, requeued: false };
        }
        const pending = {
          ...record,
          status: 'PENDING' as const,
          publicResult: null,
          errorCode: null,
          completedAt: null,
        };
        records.set(id, pending);
        return { run: pending, requeued: true };
      }),
      createFeedback: vi.fn(),
    },
  };
}

function dependencies(
  repository: QuestionRunRepository,
  answerOverrides: Partial<EvidenceAnswerDependencies> = {}
) {
  const answerDependencies = {
    repository: {
      getPublishedRelease: vi.fn().mockResolvedValue({
        ...release,
        literatureCutoffAt: '2026-09-01T00:00:00.000Z',
        regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
        gradingRuleVersion: 'evidex-therapeutic-v1',
      }),
      retrieveEvidence: vi.fn().mockResolvedValue([
        { scope: 'SAME_DISEASE', therapies: [] },
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
      ]),
      findAnswerSnapshot: vi.fn(),
      saveAnswerSnapshot: vi.fn(),
    },
    generator: { generate: vi.fn() },
    promptVersion: 'evidex-answer-v1',
    provider: 'evolink',
    model: 'gpt-5.6-terra',
    now: () => new Date('2026-09-16T00:00:01.000Z'),
    ...answerOverrides,
  } satisfies EvidenceAnswerDependencies;
  return {
    repository,
    getAnswerDependencies: vi.fn().mockReturnValue(answerDependencies),
    createId: () => 'question-run-1',
    now: () => new Date('2026-09-16T00:00:00.000Z'),
  } satisfies QuestionWorkflowDependencies;
}

describe('persisted natural-language question workflow', () => {
  it('locks the release, redacts identifiers, and reuses the idempotency key', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    const value = {
      question: '邮箱 alice@example.com：NSCLC 的 EGFR p.L858R 有哪些证据？',
      locale: 'zh-CN',
    };
    const first = await submitEvidenceQuestion({
      value,
      idempotencyKey: 'browser-request-1',
      dependencies: deps,
    });
    expect(first).toMatchObject({
      id: 'question-run-1',
      status: 'PENDING',
      knowledgeRelease: release,
      interpretation: { status: 'RESOLVED' },
    });
    expect(first.redactedQuestion).not.toContain('alice@example.com');

    const repeated = await submitEvidenceQuestion({
      value,
      idempotencyKey: 'browser-request-1',
      dependencies: deps,
    });
    expect(repeated.id).toBe(first.id);
    expect(store.repository.create).toHaveBeenCalledTimes(1);
    expect(store.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        understandingTrace: expect.objectContaining({
          skillId: 'understand_question',
          skillVersion: '1.0.0',
        }),
      })
    );
  });

  it('returns the repository winner when concurrent submissions share a key', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    store.repository.create = vi.fn(async (input) => ({
      ...input,
      id: 'question-run-winner',
    }));
    await expect(
      submitEvidenceQuestion({
        value: {
          question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
          locale: 'zh-CN',
        },
        idempotencyKey: 'concurrent-key',
        dependencies: deps,
      })
    ).resolves.toMatchObject({ id: 'question-run-winner' });
  });

  it('completes clarification without constructing answer dependencies', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    const run = await submitEvidenceQuestion({
      value: {
        question: 'EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'clarification-1',
      dependencies: deps,
    });

    await expect(
      processEvidenceQuestionRun({
        questionRunId: run.id,
        dependencies: deps,
      })
    ).resolves.toMatchObject({
      status: 'NEEDS_CLARIFICATION',
      publicResult: {
        status: 'NEEDS_CLARIFICATION',
        missingFields: ['disease'],
      },
    });
    expect(deps.getAnswerDependencies).not.toHaveBeenCalled();
  });

  it('reuses the locked structured evidence chain and persists its terminal status', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    const run = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'answer-1',
      dependencies: deps,
    });
    const result = await processEvidenceQuestionRun({
      questionRunId: run.id,
      dependencies: deps,
    });

    expect(deps.getAnswerDependencies).toHaveBeenCalledWith(
      'v1.0.0',
      expect.objectContaining({ status: 'RESOLVED', intent: 'EVIDENCE_QA' })
    );
    expect(result).toMatchObject({
      status: 'NO_CURATED_EVIDENCE',
      publicResult: {
        status: 'NO_CURATED_EVIDENCE',
        knowledge: { release: 'v1.0.0' },
      },
    });
    expect(store.repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: run.id,
        status: 'NO_CURATED_EVIDENCE',
      })
    );
    expect(store.repository.recordTrace).toHaveBeenCalledWith({
      questionRunId: run.id,
      trace: expect.objectContaining({ stepKey: 'normalize_query' }),
    });
    expect(store.repository.recordTrace).toHaveBeenCalledWith({
      questionRunId: run.id,
      trace: expect.objectContaining({ stepKey: 'build_evidence_pack' }),
    });
  });

  it('returns unavailable release and invalid request as safe submission failures', async () => {
    const store = stores();
    store.repository.getPublishedRelease = vi.fn().mockResolvedValue(null);
    await expect(
      submitEvidenceQuestion({
        value: {
          question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
          locale: 'zh-CN',
        },
        idempotencyKey: 'no-release',
        dependencies: dependencies(store.repository),
      })
    ).rejects.toThrow(/release/i);

    await expect(
      submitEvidenceQuestion({
        value: { question: '', locale: 'zh-CN' },
        idempotencyKey: 'invalid',
        dependencies: dependencies(stores().repository),
      })
    ).rejects.toThrow(/question/i);

    await expect(
      submitEvidenceQuestion({
        value: {
          question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
          locale: 'zh-CN',
        },
        idempotencyKey: ' ',
        dependencies: dependencies(stores().repository),
      })
    ).rejects.toThrow(/idempotency/i);
  });

  it('completes out-of-scope input without starting evidence retrieval', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    const run = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 应该用多少毫克？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'out-of-scope-1',
      dependencies: deps,
    });
    await expect(
      processEvidenceQuestionRun({ questionRunId: run.id, dependencies: deps })
    ).resolves.toMatchObject({ status: 'OUT_OF_SCOPE' });
    expect(deps.getAnswerDependencies).not.toHaveBeenCalled();
  });

  it('does not rerun a task that another worker already claimed', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    store.repository.markRunning = vi.fn().mockResolvedValue(null);
    store.repository.get = vi.fn().mockResolvedValue({
      id: 'already-complete',
      status: 'ANSWERED',
    });
    await expect(
      processEvidenceQuestionRun({
        questionRunId: 'already-complete',
        dependencies: deps,
      })
    ).resolves.toMatchObject({ status: 'ANSWERED' });
    expect(deps.getAnswerDependencies).not.toHaveBeenCalled();
  });

  it('resumes a RUNNING question after a stale durable job lock is recovered', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    const run = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'stale-question-job',
      dependencies: deps,
    });
    store.records.set(run.id, { ...run, status: 'RUNNING' });
    store.repository.markRunning = vi.fn(async (id, allowResume) => {
      const record = store.records.get(id);
      return allowResume && record?.status === 'RUNNING' ? record : null;
    });

    await expect(
      processEvidenceQuestionRun({
        questionRunId: run.id,
        resumeExisting: true,
        dependencies: deps,
      })
    ).resolves.toMatchObject({ status: 'NO_CURATED_EVIDENCE' });
  });

  it('persists safe failure states for unavailable and unexpected answer work', async () => {
    const unavailableStore = stores();
    const unavailableDeps = dependencies(unavailableStore.repository);
    const answerDeps = unavailableDeps.getAnswerDependencies('v1.0.0');
    answerDeps.repository.getPublishedRelease = vi.fn().mockResolvedValue(null);
    const unavailable = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'answer-unavailable',
      dependencies: unavailableDeps,
    });
    await expect(
      processEvidenceQuestionRun({
        questionRunId: unavailable.id,
        dependencies: unavailableDeps,
      })
    ).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'KNOWLEDGE_RELEASE_UNAVAILABLE',
    });

    const unexpectedStore = stores();
    const unexpectedDeps = dependencies(unexpectedStore.repository);
    unexpectedDeps.getAnswerDependencies = vi.fn(() => {
      throw new Error('dependency unavailable');
    });
    const unexpected = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'answer-unexpected',
      dependencies: unexpectedDeps,
    });
    await expect(
      processEvidenceQuestionRun({
        questionRunId: unexpected.id,
        dependencies: unexpectedDeps,
      })
    ).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'UNEXPECTED_WORKFLOW_ERROR',
    });
  });

  it('uses server UUIDs and clocks when deterministic test hooks are absent', async () => {
    const store = stores();
    const deps: QuestionWorkflowDependencies = dependencies(store.repository);
    delete deps.createId;
    delete deps.now;
    const run = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'server-defaults',
      dependencies: deps,
    });
    expect(run.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      processEvidenceQuestionRun({ questionRunId: run.id, dependencies: deps })
    ).resolves.toMatchObject({ status: 'NO_CURATED_EVIDENCE' });
  });

  it('requeues a failed Question Run without creating a duplicate', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    store.records.set('question-run-failed', {
      id: 'question-run-failed',
      status: 'FAILED',
      publicResult: { status: 'FAILED' },
      errorCode: 'PROVIDER_UNAVAILABLE',
      completedAt: '2026-09-16T00:00:00.000Z',
    } as QuestionRunRecord);

    await expect(
      retryEvidenceQuestionRun({
        questionRunId: 'question-run-failed',
        dependencies: deps,
      })
    ).resolves.toMatchObject({
      questionRunId: 'question-run-failed',
      status: 'PENDING',
      requeued: true,
    });
    expect(store.repository.requeue).toHaveBeenCalledWith(
      'question-run-failed'
    );
    expect(store.repository.create).not.toHaveBeenCalled();
  });

  it('makes duplicate retry clicks idempotent and rejects non-retryable runs', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    store.records.set('question-run-pending', {
      id: 'question-run-pending',
      status: 'PENDING',
    } as QuestionRunRecord);
    await expect(
      retryEvidenceQuestionRun({
        questionRunId: 'question-run-pending',
        dependencies: deps,
      })
    ).resolves.toMatchObject({ status: 'PENDING', requeued: false });

    store.records.set('question-run-answered', {
      id: 'question-run-answered',
      status: 'ANSWERED',
    } as QuestionRunRecord);
    await expect(
      retryEvidenceQuestionRun({
        questionRunId: 'question-run-answered',
        dependencies: deps,
      })
    ).rejects.toMatchObject({ code: 'QUESTION_RUN_NOT_RETRYABLE' });
    await expect(
      retryEvidenceQuestionRun({
        questionRunId: 'missing',
        dependencies: deps,
      })
    ).rejects.toMatchObject({ code: 'QUESTION_RUN_NOT_FOUND' });
  });

  it('records feedback only for a completed Question Run', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    const completed = {
      id: 'question-run-complete',
      status: 'ANSWERED' as const,
    } as QuestionRunRecord;
    store.repository.get = vi.fn().mockResolvedValue(completed);
    store.repository.createFeedback = vi.fn(async (input) => ({
      id: input.id,
      questionRunId: input.questionRunId,
      answerVersion: 'answer-hash',
      knowledgeRelease: 'v1.0.0',
      category: input.category,
      createdAt: input.createdAt,
      idempotent: false,
    }));

    await expect(
      createQuestionFeedback({
        questionRunId: completed.id,
        value: { category: 'HELPFUL', comment: '证据层级很清晰' },
        idempotencyKey: 'feedback-1',
        dependencies: deps,
      })
    ).resolves.toMatchObject({
      questionRunId: completed.id,
      category: 'HELPFUL',
      knowledgeRelease: 'v1.0.0',
    });
    expect(store.repository.createFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        questionRunId: completed.id,
        comment: '证据层级很清晰',
        idempotencyKey: 'feedback-1',
      })
    );
  });

  it('rejects invalid, unknown, and unfinished Question Run feedback', async () => {
    const store = stores();
    const deps = dependencies(store.repository);
    await expect(
      createQuestionFeedback({
        questionRunId: 'missing',
        value: { category: 'NOT_A_CATEGORY' },
        idempotencyKey: 'feedback-invalid',
        dependencies: deps,
      })
    ).rejects.toMatchObject({ code: 'INVALID_FEEDBACK' });

    await expect(
      createQuestionFeedback({
        questionRunId: 'missing',
        value: { category: 'NOT_HELPFUL' },
        idempotencyKey: 'feedback-missing',
        dependencies: deps,
      })
    ).rejects.toMatchObject({ code: 'QUESTION_RUN_NOT_FOUND' });

    store.repository.get = vi.fn().mockResolvedValue({
      id: 'question-run-pending',
      status: 'RUNNING',
    });
    await expect(
      createQuestionFeedback({
        questionRunId: 'question-run-pending',
        value: { category: 'NOT_HELPFUL' },
        idempotencyKey: 'feedback-pending',
        dependencies: deps,
      })
    ).rejects.toMatchObject({ code: 'QUESTION_RUN_NOT_COMPLETED' });
    expect(store.repository.createFeedback).not.toHaveBeenCalled();
  });

  it('uses server UUIDs and time for feedback when hooks are absent', async () => {
    const store = stores();
    const deps: QuestionWorkflowDependencies = dependencies(store.repository);
    delete deps.createId;
    delete deps.now;
    store.repository.get = vi.fn().mockResolvedValue({
      id: 'question-run-complete',
      status: 'ANSWERED',
    });
    store.repository.createFeedback = vi.fn(async (input) => ({
      id: input.id,
      questionRunId: input.questionRunId,
      answerVersion: 'answer-hash',
      knowledgeRelease: 'v1.0.0',
      category: input.category,
      createdAt: input.createdAt,
      idempotent: false,
    }));

    const result = await createQuestionFeedback({
      questionRunId: 'question-run-complete',
      value: { category: 'OTHER' },
      idempotencyKey: 'feedback-defaults',
      dependencies: deps,
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(result.createdAt)).not.toBeNaN();
  });
});
