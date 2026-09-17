import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  answerEvidenceQuery,
  type EvidenceAnswerDependencies,
  type EvidenceAnswerTrace,
} from '@/shared/services/evidence/answer-evidence-query';
import type {
  FeedbackCategory,
  QuestionFeedbackResult,
} from '@/shared/types/evidence-platform-api';

import {
  type InterpretedEvidenceQuestion,
  type NaturalLanguageQuestionInput,
  type QuestionEntityCatalog,
} from './natural-language-question';
import { executeQuestionUnderstanding } from './question-skill-runtime';
import { hashArtifact, type SkillExecutionTrace } from './skill-runtime';

export type QuestionRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'NEEDS_CLARIFICATION'
  | 'ANSWERED'
  | 'NO_CURATED_EVIDENCE'
  | 'OUT_OF_SCOPE'
  | 'SUMMARY_UNAVAILABLE'
  | 'FAILED'
  | 'CANCELLED';

export interface QuestionRunRecord {
  id: string;
  questionHash: string;
  redactedQuestion: string;
  locale: 'zh-CN';
  context: NaturalLanguageQuestionInput['context'];
  interpretation: InterpretedEvidenceQuestion;
  status: QuestionRunStatus;
  knowledgeRelease: {
    id: string;
    version: string;
    literatureCutoffAt?: string;
    regulatoryCutoffAt?: string;
    gradingRuleVersion?: string;
  };
  publicResult: unknown | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  workflowRunId?: string | null;
  currentStep?: string | null;
}

export type QuestionWorkflowTrace = EvidenceAnswerTrace;

export interface QuestionRunRepository {
  getPublishedRelease(): Promise<QuestionRunRecord['knowledgeRelease'] | null>;
  getQuestionEntityCatalog(releaseId: string): Promise<QuestionEntityCatalog>;
  findByIdempotencyKey(key: string): Promise<QuestionRunRecord | null>;
  create(
    input: QuestionRunRecord & {
      idempotencyKey: string;
      understandingTrace: SkillExecutionTrace<InterpretedEvidenceQuestion>;
    }
  ): Promise<QuestionRunRecord>;
  get(id: string): Promise<QuestionRunRecord | null>;
  markRunning(
    id: string,
    allowResume?: boolean
  ): Promise<QuestionRunRecord | null>;
  complete(input: {
    id: string;
    status: Exclude<QuestionRunStatus, 'PENDING' | 'RUNNING'>;
    publicResult: unknown;
    errorCode?: string | null;
    completedAt: string;
  }): Promise<QuestionRunRecord>;
  recordTrace(input: {
    questionRunId: string;
    trace: QuestionWorkflowTrace;
  }): Promise<void>;
  requeue(id: string): Promise<{
    run: QuestionRunRecord;
    requeued: boolean;
  } | null>;
  createFeedback(input: {
    id: string;
    questionRunId: string;
    category: FeedbackCategory;
    comment: string | null;
    idempotencyKey: string;
    createdAt: string;
  }): Promise<QuestionFeedbackResult>;
}

export interface QuestionWorkflowDependencies {
  repository: QuestionRunRepository;
  getAnswerDependencies(
    releaseVersion: string,
    interpretation?: InterpretedEvidenceQuestion
  ): EvidenceAnswerDependencies;
  createId?: () => string;
  now?: () => Date;
}

export async function submitEvidenceQuestion(_input: {
  value: unknown;
  idempotencyKey: string;
  dependencies: QuestionWorkflowDependencies;
}): Promise<QuestionRunRecord> {
  const idempotencyKey = _input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new Error('A valid idempotency key is required');
  }
  const parsed = questionInputSchema.safeParse(_input.value);
  if (!parsed.success) {
    throw new Error('Question input is invalid');
  }
  const existing =
    await _input.dependencies.repository.findByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  const release = await _input.dependencies.repository.getPublishedRelease();
  if (!release) throw new Error('Published knowledge release is unavailable');
  const catalog = await _input.dependencies.repository.getQuestionEntityCatalog(
    release.id
  );
  const understandingTrace = await executeQuestionUnderstanding({
    value: parsed.data,
    catalog,
  });
  const interpretation = understandingTrace.output;
  const timestamp = (_input.dependencies.now ?? (() => new Date()))();
  const record: QuestionRunRecord = {
    id: (_input.dependencies.createId ?? randomUUID)(),
    questionHash: hashArtifact({
      question: parsed.data.question,
      context: parsed.data.context ?? {},
      locale: parsed.data.locale,
    }),
    redactedQuestion: interpretation.redactedQuestion,
    locale: parsed.data.locale,
    context: parsed.data.context,
    interpretation,
    status: 'PENDING',
    knowledgeRelease: release,
    publicResult: null,
    errorCode: null,
    createdAt: timestamp.toISOString(),
    completedAt: null,
  };
  return _input.dependencies.repository.create({
    ...record,
    idempotencyKey,
    understandingTrace,
  });
}

export async function processEvidenceQuestionRun(_input: {
  questionRunId: string;
  resumeExisting?: boolean;
  dependencies: QuestionWorkflowDependencies;
}): Promise<QuestionRunRecord | null> {
  const running = await _input.dependencies.repository.markRunning(
    _input.questionRunId,
    _input.resumeExisting
  );
  if (!running) {
    return _input.dependencies.repository.get(_input.questionRunId);
  }
  const completedAt = () =>
    (_input.dependencies.now ?? (() => new Date()))().toISOString();
  const interpretation = running.interpretation;
  if (interpretation.status === 'NEEDS_CLARIFICATION') {
    const generatedAt = completedAt();
    return _input.dependencies.repository.complete({
      id: running.id,
      status: 'NEEDS_CLARIFICATION',
      publicResult: {
        status: 'NEEDS_CLARIFICATION',
        missingFields: interpretation.missingFields,
        question: interpretation.question,
        originalQuestion: running.redactedQuestion,
        ...questionPublicMetadata(running, generatedAt),
      },
      completedAt: generatedAt,
    });
  }
  if (interpretation.status === 'OUT_OF_SCOPE') {
    const generatedAt = completedAt();
    return _input.dependencies.repository.complete({
      id: running.id,
      status: 'OUT_OF_SCOPE',
      publicResult: {
        status: 'OUT_OF_SCOPE',
        reason: interpretation.reason,
        ...questionPublicMetadata(running, generatedAt),
      },
      completedAt: generatedAt,
    });
  }

  try {
    const answerDependencies = _input.dependencies.getAnswerDependencies(
      running.knowledgeRelease.version,
      interpretation
    );
    const existingTrace = answerDependencies.trace;
    const answer = await answerEvidenceQuery(interpretation.query, {
      ...answerDependencies,
      trace: async (trace) => {
        await existingTrace?.(trace);
        await _input.dependencies.repository.recordTrace({
          questionRunId: running.id,
          trace,
        });
      },
    });
    if (
      answer.status === 'INVALID_INPUT' ||
      answer.status === 'KNOWLEDGE_RELEASE_UNAVAILABLE'
    ) {
      const generatedAt = completedAt();
      return _input.dependencies.repository.complete({
        id: running.id,
        status: 'FAILED',
        publicResult: {
          status: 'FAILED',
          message: 'EVIDENCE_WORKFLOW_UNAVAILABLE',
          ...questionPublicMetadata(running, generatedAt),
        },
        errorCode: answer.status,
        completedAt: generatedAt,
      });
    }
    const status = answer.status as Exclude<
      QuestionRunStatus,
      'PENDING' | 'RUNNING' | 'FAILED' | 'CANCELLED' | 'NEEDS_CLARIFICATION'
    >;
    return _input.dependencies.repository.complete({
      id: running.id,
      status,
      publicResult: answer,
      completedAt: completedAt(),
    });
  } catch {
    const generatedAt = completedAt();
    return _input.dependencies.repository.complete({
      id: running.id,
      status: 'FAILED',
      publicResult: {
        status: 'FAILED',
        message: 'EVIDENCE_WORKFLOW_UNAVAILABLE',
        ...questionPublicMetadata(running, generatedAt),
      },
      errorCode: 'UNEXPECTED_WORKFLOW_ERROR',
      completedAt: generatedAt,
    });
  }
}

export const questionDisclaimer =
  '仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。';
export const questionDisclaimerEn =
  'For oncology education and research only. Not medical advice, diagnosis, or a treatment decision.';

export class QuestionRetryError extends Error {
  constructor(
    public readonly code:
      | 'QUESTION_RUN_NOT_FOUND'
      | 'QUESTION_RUN_NOT_RETRYABLE'
  ) {
    super(code);
    this.name = 'QuestionRetryError';
  }
}

export async function retryEvidenceQuestionRun(_input: {
  questionRunId: string;
  dependencies: QuestionWorkflowDependencies;
}) {
  const result = await _input.dependencies.repository.requeue(
    _input.questionRunId
  );
  if (!result) throw new QuestionRetryError('QUESTION_RUN_NOT_FOUND');
  if (!result.requeued && !['PENDING', 'RUNNING'].includes(result.run.status)) {
    throw new QuestionRetryError('QUESTION_RUN_NOT_RETRYABLE');
  }
  return {
    questionRunId: result.run.id,
    status: result.run.status,
    requeued: result.requeued,
  };
}

function questionPublicMetadata(run: QuestionRunRecord, generatedAt: string) {
  return {
    knowledge: {
      release: run.knowledgeRelease.version,
      literatureCutoffAt: run.knowledgeRelease.literatureCutoffAt ?? null,
      regulatoryCutoffAt: run.knowledgeRelease.regulatoryCutoffAt ?? null,
      gradingRuleVersion: run.knowledgeRelease.gradingRuleVersion ?? null,
    },
    generatedAt,
    disclaimer: questionDisclaimer,
    disclaimerEn: questionDisclaimerEn,
  };
}

export class QuestionFeedbackError extends Error {
  constructor(
    public readonly code:
      | 'QUESTION_RUN_NOT_FOUND'
      | 'QUESTION_RUN_NOT_COMPLETED'
      | 'INVALID_FEEDBACK'
  ) {
    super(code);
    this.name = 'QuestionFeedbackError';
  }
}

export async function createQuestionFeedback(_input: {
  questionRunId: string;
  value: unknown;
  idempotencyKey: string;
  dependencies: QuestionWorkflowDependencies;
}): Promise<QuestionFeedbackResult> {
  const parsed = feedbackInputSchema.safeParse(_input.value);
  const idempotencyKey = _input.idempotencyKey.trim();
  if (!parsed.success || !idempotencyKey || idempotencyKey.length > 200) {
    throw new QuestionFeedbackError('INVALID_FEEDBACK');
  }
  const run = await _input.dependencies.repository.get(_input.questionRunId);
  if (!run) throw new QuestionFeedbackError('QUESTION_RUN_NOT_FOUND');
  if (run.status === 'PENDING' || run.status === 'RUNNING') {
    throw new QuestionFeedbackError('QUESTION_RUN_NOT_COMPLETED');
  }
  const createdAt = (_input.dependencies.now ?? (() => new Date()))();
  return _input.dependencies.repository.createFeedback({
    id: (_input.dependencies.createId ?? randomUUID)(),
    questionRunId: run.id,
    category: parsed.data.category,
    comment: parsed.data.comment ?? null,
    idempotencyKey,
    createdAt: createdAt.toISOString(),
  });
}

const questionInputSchema = z
  .object({
    question: z.string().trim().min(1).max(4_000),
    locale: z.literal('zh-CN'),
    context: z
      .object({
        disease: z.string().trim().min(1).max(100).optional(),
        gene: z.string().trim().min(1).max(30).optional(),
        variant: z.string().trim().min(1).max(100).optional(),
        drug: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const feedbackInputSchema = z
  .object({
    category: z.enum([
      'HELPFUL',
      'NOT_HELPFUL',
      'IRRELEVANT_CITATION',
      'MISSING_LIMITATION',
      'HARD_TO_UNDERSTAND',
      'OTHER',
    ]),
    comment: z.string().trim().max(2_000).optional(),
  })
  .strict();
