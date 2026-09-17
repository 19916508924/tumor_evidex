import { createHash } from 'node:crypto';
import { z, type ZodType } from 'zod';

import type {
  EvidenceAnswerDraft,
  EvidencePack,
  EvidenceResultGroup,
  KnowledgeReleaseInfo,
  NormalizedEvidenceQuery,
} from '@/shared/types/evidence';

import {
  executeSkill,
  hashArtifact,
  SkillExecutionError,
  type SkillDefinition,
} from '../evidence-platform/skill-runtime';
import { buildEvidencePack, toPublicResultGroups } from './build-evidence-pack';
import { normalizeEvidenceQuery } from './normalize-query';
import { validateEvidenceAnswer } from './validate-answer';

export interface EvidenceAnswerTrace {
  stepKey:
    | 'normalize_query'
    | 'build_retrieval_plan'
    | 'build_evidence_pack'
    | 'analyze_evidence'
    | 'compose_evidence_answer'
    | 'validate_answer';
  status: 'SUCCEEDED' | 'FAILED';
  agentVersion: string;
  skillVersion: string;
  inputHash: string;
  outputHash: string | null;
  output?: unknown;
  durationMs: number;
  attempt: number;
  errorCode?: string;
  errorSummary?: string;
}

export interface AnswerSnapshotKey {
  requestFingerprint: string;
  knowledgeReleaseId: string;
  promptVersion: string;
  provider: string;
  model: string;
  locale: 'zh-CN';
}

export interface StoredAnswerSnapshot {
  structuredOutput: unknown;
  createdAt: string;
}

export interface NewAnswerSnapshot extends AnswerSnapshotKey {
  evidenceIds: string[];
  associationIds: string[];
  regulatoryApprovalIds: string[];
  structuredOutput: EvidenceAnswerDraft;
  validationStatus: 'VALID';
  latencyMs: number;
  createdAt: string;
}

export interface EvidenceRepository {
  getPublishedRelease(): Promise<KnowledgeReleaseInfo | null>;
  retrieveEvidence(
    releaseId: string,
    query: NormalizedEvidenceQuery
  ): Promise<EvidenceResultGroup[]>;
  findAnswerSnapshot(
    key: AnswerSnapshotKey
  ): Promise<StoredAnswerSnapshot | null>;
  saveAnswerSnapshot(snapshot: NewAnswerSnapshot): Promise<void>;
}

export interface EvidenceAnswerGenerator {
  generate(input: {
    normalizedQuery: NormalizedEvidenceQuery;
    evidencePack: EvidencePack;
    promptVersion: string;
    locale: 'zh-CN';
    requestContext?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface EvidenceAnswerDependencies {
  repository: EvidenceRepository;
  generator: EvidenceAnswerGenerator;
  promptVersion: string;
  provider: string;
  model: string;
  requestContext?: Record<string, unknown>;
  normalizedQuery?: NormalizedEvidenceQuery;
  trace?: (trace: EvidenceAnswerTrace) => Promise<void>;
  now?: () => Date;
  logError?: (message: string, error: unknown) => void;
}

const disclaimer = '仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。';
const disclaimerEn =
  'For oncology education and research only. Not medical advice, diagnosis, or a treatment decision.';

function createRequestFingerprint(
  query: NormalizedEvidenceQuery,
  requestContext: Record<string, unknown> | undefined,
  evidencePackHash: string
) {
  const canonical = JSON.stringify({
    disease: query.disease,
    gene: query.gene,
    alterationType: query.alterationType,
    hgvsp: query.hgvsp,
    jurisdiction: query.jurisdiction,
    locale: query.locale,
    requestContext: requestContext ?? {},
    evidencePackHash,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function responseKnowledge(
  release: KnowledgeReleaseInfo,
  promptVersion: string
) {
  return {
    release: release.version,
    literatureCutoffAt: release.literatureCutoffAt,
    regulatoryCutoffAt: release.regulatoryCutoffAt,
    gradingRuleVersion: release.gradingRuleVersion,
    promptVersion,
  };
}

function collectPackIds(pack: EvidencePack) {
  const associationIds: string[] = [];
  const evidenceIds: string[] = [];
  const regulatoryApprovalIds: string[] = [];

  for (const group of pack.groups) {
    for (const therapy of group.therapies) {
      associationIds.push(therapy.associationId);
      evidenceIds.push(...therapy.evidenceClaims.map((claim) => claim.id));
      regulatoryApprovalIds.push(
        ...therapy.regulatoryApprovals.map((approval) => approval.id)
      );
    }
  }

  return {
    associationIds: associationIds.sort(),
    evidenceIds: evidenceIds.sort(),
    regulatoryApprovalIds: regulatoryApprovalIds.sort(),
  };
}

export async function answerEvidenceQuery(
  input: unknown,
  dependencies: EvidenceAnswerDependencies
) {
  const normalized = await runAnswerSkill({
    dependencies,
    stepKey: 'normalize_query',
    input,
    outputSchema: z.custom<ReturnType<typeof normalizeEvidenceQuery>>(
      isNormalizationResult
    ),
    execute: async () =>
      dependencies.normalizedQuery
        ? ({ status: 'VALID', value: dependencies.normalizedQuery } as const)
        : normalizeEvidenceQuery(input),
    timeoutMs: 5_000,
    maxAttempts: 1,
  });
  if (normalized.status !== 'VALID') {
    return normalized;
  }

  const now = dependencies.now ?? (() => new Date());
  const logError = dependencies.logError ?? console.error;
  let release: KnowledgeReleaseInfo;
  let resultGroups: EvidenceResultGroup[];
  let evidencePack: EvidencePack;

  try {
    const retrievalPlan = await runAnswerSkill({
      dependencies,
      stepKey: 'build_retrieval_plan',
      input: { query: normalized.value },
      outputSchema: z.custom<RetrievalPlanResult>(isRetrievalPlanResult),
      execute: async () => {
        const publishedRelease =
          await dependencies.repository.getPublishedRelease();
        return publishedRelease
          ? {
              status: 'READY' as const,
              release: publishedRelease,
              steps: [
                'SAME_DISEASE_EXACT_VARIANT',
                'CROSS_INDICATION_EXACT_VARIANT',
                'RESISTANCE_EVIDENCE',
                'REGULATORY_APPROVALS',
                'SOURCE_PASSAGES',
              ],
            }
          : { status: 'UNAVAILABLE' as const };
      },
      timeoutMs: 30_000,
      maxAttempts: 1,
    });
    if (retrievalPlan.status === 'UNAVAILABLE') {
      return { status: 'KNOWLEDGE_RELEASE_UNAVAILABLE' as const };
    }
    release = retrievalPlan.release;
    const retrieval = await runAnswerSkill({
      dependencies,
      stepKey: 'build_evidence_pack',
      input: { query: normalized.value, releaseId: release.id },
      outputSchema: z.custom<RetrievalResult>(isRetrievalResult),
      execute: async () => {
        const groups = await dependencies.repository.retrieveEvidence(
          release.id,
          normalized.value
        );
        return {
          resultGroups: groups,
          evidencePack: buildEvidencePack({
            query: normalized.value,
            release,
            resultGroups: groups,
          }),
        };
      },
      timeoutMs: 60_000,
      maxAttempts: 2,
    });
    resultGroups = retrieval.resultGroups;
    evidencePack = retrieval.evidencePack;
  } catch (error) {
    logError('Failed to retrieve Evidex knowledge', error);
    return { status: 'KNOWLEDGE_RELEASE_UNAVAILABLE' as const };
  }

  const publicGroups = toPublicResultGroups(resultGroups);
  const evidenceAnalysis = await runAnswerSkill({
    dependencies,
    stepKey: 'analyze_evidence',
    input: evidencePack,
    outputSchema: z.object({
      therapyCount: z.number().int().nonnegative(),
      sensitivityCount: z.number().int().nonnegative(),
      resistanceCount: z.number().int().nonnegative(),
      limitationCount: z.number().int().nonnegative(),
      approvedLevels: z.array(z.string()),
    }),
    execute: async () => analyzeEvidencePack(evidencePack),
    timeoutMs: 10_000,
    maxAttempts: 1,
  });
  const baseResponse = {
    normalizedInput: normalized.value,
    knowledge: responseKnowledge(release, dependencies.promptVersion),
    resultGroups: publicGroups,
    disclaimer,
    disclaimerEn,
  };

  if (!evidencePack.groups.some((group) => group.therapies.length > 0)) {
    return {
      status: 'NO_CURATED_EVIDENCE' as const,
      ...baseResponse,
      answer: null,
      generatedAt: now().toISOString(),
      cached: false,
    };
  }

  const snapshotKey: AnswerSnapshotKey = {
    requestFingerprint: createRequestFingerprint(
      normalized.value,
      dependencies.requestContext,
      hashArtifact(evidencePack)
    ),
    knowledgeReleaseId: release.id,
    promptVersion: dependencies.promptVersion,
    provider: dependencies.provider,
    model: dependencies.model,
    locale: normalized.value.locale,
  };

  try {
    const snapshot =
      await dependencies.repository.findAnswerSnapshot(snapshotKey);
    if (snapshot) {
      await runAnswerSkill({
        dependencies,
        stepKey: 'compose_evidence_answer',
        input: {
          evidencePackHash: hashArtifact(evidencePack),
          source: 'CACHE',
        },
        outputSchema: z.unknown(),
        execute: async () => snapshot.structuredOutput,
        timeoutMs: 120_000,
        maxAttempts: 1,
      });
      const cachedAnswer = await validateWithSkill(
        dependencies,
        snapshot.structuredOutput,
        evidencePack
      );
      if (cachedAnswer.success) {
        return {
          status: 'ANSWERED' as const,
          ...baseResponse,
          answer: cachedAnswer.data,
          generatedAt: snapshot.createdAt,
          cached: true,
        };
      }
      logError('Rejected invalid cached evidence answer', cachedAnswer.issues);
    }
  } catch (error) {
    logError('Failed to read evidence answer snapshot', error);
  }

  const startedAt = now();
  let generated: unknown;
  try {
    generated = await runAnswerSkill({
      dependencies,
      stepKey: 'compose_evidence_answer',
      input: { normalizedQuery: normalized.value, evidencePack },
      outputSchema: z.custom(
        (value) => validateEvidenceAnswer(value, evidencePack).success
      ),
      execute: async () =>
        dependencies.generator.generate({
          normalizedQuery: normalized.value,
          evidencePack,
          promptVersion: dependencies.promptVersion,
          locale: normalized.value.locale,
          requestContext: {
            ...dependencies.requestContext,
            evidenceAnalysis,
          },
        }),
      timeoutMs: 120_000,
      maxAttempts: 2,
    });
  } catch (error) {
    logError('Evidence answer generation failed', error);
    return {
      status: 'SUMMARY_UNAVAILABLE' as const,
      ...baseResponse,
      answer: null,
      generatedAt: now().toISOString(),
      cached: false,
    };
  }

  const validation = await validateWithSkill(
    dependencies,
    generated,
    evidencePack
  );
  if (!validation.success) {
    logError('Evidence answer validation failed', validation.issues);
    return {
      status: 'SUMMARY_UNAVAILABLE' as const,
      ...baseResponse,
      answer: null,
      generatedAt: now().toISOString(),
      cached: false,
    };
  }

  const generatedAt = now();
  const packIds = collectPackIds(evidencePack);
  try {
    await dependencies.repository.saveAnswerSnapshot({
      ...snapshotKey,
      ...packIds,
      structuredOutput: validation.data,
      validationStatus: 'VALID',
      latencyMs: Math.max(0, generatedAt.getTime() - startedAt.getTime()),
      createdAt: generatedAt.toISOString(),
    });
  } catch (error) {
    logError('Failed to save evidence answer snapshot', error);
  }

  return {
    status: 'ANSWERED' as const,
    ...baseResponse,
    answer: validation.data,
    generatedAt: generatedAt.toISOString(),
    cached: false,
  };
}

async function validateWithSkill(
  dependencies: EvidenceAnswerDependencies,
  answer: unknown,
  evidencePack: EvidencePack
) {
  return runAnswerSkill({
    dependencies,
    stepKey: 'validate_answer',
    input: { answer, evidencePack },
    outputSchema: z.custom<ReturnType<typeof validateEvidenceAnswer>>((value) =>
      Boolean(
        value &&
          typeof value === 'object' &&
          'success' in value &&
          typeof value.success === 'boolean'
      )
    ),
    execute: async () => validateEvidenceAnswer(answer, evidencePack),
    timeoutMs: 10_000,
    maxAttempts: 1,
  });
}

async function runAnswerSkill<Output>(input: {
  dependencies: EvidenceAnswerDependencies;
  stepKey: EvidenceAnswerTrace['stepKey'];
  input: unknown;
  outputSchema: ZodType<Output>;
  execute: () => Promise<Output>;
  timeoutMs: number;
  maxAttempts: number;
}) {
  const agentId = answerAgentByStep[input.stepKey];
  const definition: SkillDefinition<unknown, Output> = {
    skillId: input.stepKey,
    name: input.stepKey,
    version: '1.0.0',
    kind:
      input.stepKey === 'compose_evidence_answer' ? 'MODEL' : 'DETERMINISTIC',
    description: `Governed evidence answer step: ${input.stepKey}`,
    inputSchema: z.unknown(),
    outputSchema: input.outputSchema,
    allowedTools: ['build_retrieval_plan', 'build_evidence_pack'].includes(
      input.stepKey
    )
      ? ['knowledge.read']
      : [],
    sideEffect: 'NONE',
    timeoutMs: input.timeoutMs,
    maxAttempts: input.maxAttempts,
    riskLevel: 'HIGH',
    evaluationSuiteId: null,
    status: 'ACTIVE',
    execute: input.execute,
  };
  try {
    const execution = await executeSkill({
      definition,
      agent: {
        agentId,
        version: '1.0.0',
        allowedSkillVersions: [`${input.stepKey}@1.0.0`],
      },
      value: input.input,
    });
    await input.dependencies.trace?.({
      stepKey: input.stepKey,
      status: 'SUCCEEDED',
      agentVersion: `${execution.agentId}@${execution.agentVersion}`,
      skillVersion: `${execution.skillId}@${execution.skillVersion}`,
      inputHash: execution.inputHash,
      outputHash: execution.outputHash,
      output: execution.output,
      durationMs: execution.durationMs,
      attempt: execution.attempt,
    });
    return execution.output;
  } catch (error) {
    if (error instanceof SkillExecutionError) {
      await input.dependencies.trace?.({
        stepKey: input.stepKey,
        status: 'FAILED',
        agentVersion: error.agentVersionId ?? `${agentId}@1.0.0`,
        skillVersion: error.skillVersionId ?? `${input.stepKey}@1.0.0`,
        inputHash: error.inputHash ?? hashArtifact(input.input),
        outputHash: null,
        durationMs: 0,
        attempt: Math.max(1, error.attempts),
        errorCode: error.code,
        errorSummary: error.message,
      });
    }
    throw error;
  }
}

const answerAgentByStep: Record<EvidenceAnswerTrace['stepKey'], string> = {
  normalize_query: 'question-understanding-agent',
  build_retrieval_plan: 'retrieval-planning-agent',
  build_evidence_pack: 'evidence-retrieval-agent',
  analyze_evidence: 'evidence-analysis-agent',
  compose_evidence_answer: 'answer-composition-agent',
  validate_answer: 'answer-qa-agent',
};

function analyzeEvidencePack(evidencePack: EvidencePack) {
  const therapies = evidencePack.groups.flatMap((group) => group.therapies);
  return {
    therapyCount: therapies.length,
    sensitivityCount: therapies.filter(
      (therapy) => therapy.direction === 'SENSITIVITY'
    ).length,
    resistanceCount: therapies.filter(
      (therapy) => therapy.direction === 'RESISTANCE'
    ).length,
    limitationCount: therapies.reduce(
      (total, therapy) =>
        total +
        therapy.evidenceClaims.filter((claim) => Boolean(claim.limitations))
          .length,
      0
    ),
    approvedLevels: [
      ...new Set(therapies.map((therapy) => therapy.approvedLevel)),
    ].sort(),
  };
}

function isNormalizationResult(value: unknown) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'status' in value &&
      ['VALID', 'INVALID_INPUT', 'OUT_OF_SCOPE'].includes(String(value.status))
  );
}

type RetrievalPlanResult =
  | { status: 'UNAVAILABLE' }
  | {
      status: 'READY';
      release: KnowledgeReleaseInfo;
      steps: string[];
    };

type RetrievalResult = {
  resultGroups: EvidenceResultGroup[];
  evidencePack: EvidencePack;
};

function isRetrievalPlanResult(value: unknown): value is RetrievalPlanResult {
  if (!value || typeof value !== 'object' || !('status' in value)) return false;
  if (value.status === 'UNAVAILABLE') return true;
  return Boolean(
    value.status === 'READY' &&
      'release' in value &&
      value.release &&
      typeof value.release === 'object' &&
      'id' in value.release &&
      typeof value.release.id === 'string' &&
      'steps' in value &&
      Array.isArray(value.steps) &&
      value.steps.length > 0
  );
}

function isRetrievalResult(value: unknown): value is RetrievalResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'resultGroups' in value &&
      Array.isArray(value.resultGroups) &&
      'evidencePack' in value &&
      isEvidencePack(value.evidencePack)
  );
}

function isEvidencePack(value: unknown): value is EvidencePack {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'groups' in value &&
      Array.isArray(value.groups) &&
      'knowledge' in value
  );
}
