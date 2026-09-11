import { createHash } from 'node:crypto';

import type {
  EvidenceAnswerDraft,
  EvidencePack,
  EvidenceResultGroup,
  KnowledgeReleaseInfo,
  NormalizedEvidenceQuery,
} from '@/shared/types/evidence';

import { buildEvidencePack, toPublicResultGroups } from './build-evidence-pack';
import { normalizeEvidenceQuery } from './normalize-query';
import { validateEvidenceAnswer } from './validate-answer';

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
  }): Promise<unknown>;
}

export interface EvidenceAnswerDependencies {
  repository: EvidenceRepository;
  generator: EvidenceAnswerGenerator;
  promptVersion: string;
  provider: string;
  model: string;
  now?: () => Date;
  logError?: (message: string, error: unknown) => void;
}

const disclaimer = '仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。';
const disclaimerEn =
  'For oncology education and research only. Not medical advice, diagnosis, or a treatment decision.';

function createRequestFingerprint(query: NormalizedEvidenceQuery) {
  const canonical = JSON.stringify({
    disease: query.disease,
    gene: query.gene,
    alterationType: query.alterationType,
    hgvsp: query.hgvsp,
    jurisdiction: query.jurisdiction,
    locale: query.locale,
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
  const normalized = normalizeEvidenceQuery(input);
  if (normalized.status !== 'VALID') {
    return normalized;
  }

  const now = dependencies.now ?? (() => new Date());
  const logError = dependencies.logError ?? console.error;
  let release: KnowledgeReleaseInfo | null;
  let resultGroups: EvidenceResultGroup[];

  try {
    release = await dependencies.repository.getPublishedRelease();
    if (!release) {
      return { status: 'KNOWLEDGE_RELEASE_UNAVAILABLE' as const };
    }
    resultGroups = await dependencies.repository.retrieveEvidence(
      release.id,
      normalized.value
    );
  } catch (error) {
    logError('Failed to retrieve Evidex knowledge', error);
    return { status: 'KNOWLEDGE_RELEASE_UNAVAILABLE' as const };
  }

  const evidencePack = buildEvidencePack({
    query: normalized.value,
    release,
    resultGroups,
  });
  const publicGroups = toPublicResultGroups(resultGroups);
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
    requestFingerprint: createRequestFingerprint(normalized.value),
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
      const cachedAnswer = validateEvidenceAnswer(
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
    generated = await dependencies.generator.generate({
      normalizedQuery: normalized.value,
      evidencePack,
      promptVersion: dependencies.promptVersion,
      locale: normalized.value.locale,
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

  const validation = validateEvidenceAnswer(generated, evidencePack);
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
