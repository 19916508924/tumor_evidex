import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { SkillExecutionTrace } from './skill-runtime';

export interface CandidateSourceInput {
  pmid: string;
  title: string;
  abstract: string;
  doi?: string | null;
  documentHash: string;
  publicationDate?: string | null;
  journal?: string | null;
  pmcid?: string | null;
  sourceScope?: 'ABSTRACT' | 'PMC_FULL_TEXT';
  license?: string | null;
  licensePolicy?: {
    decision: 'ALLOWED' | 'REJECTED' | 'UNKNOWN';
    licenseType: string | null;
    licenseText: string | null;
    reason: string;
  };
  fullText?: string | null;
  url: string;
}

export interface EvidenceDraftInput {
  associationId: string;
  proposedLevel: string;
  gradingRationale: string;
  passages: Array<{
    id: string;
    text: string;
    textHash: string;
    section: string;
    paragraphIndex: number;
    locator?: Record<string, unknown>;
    displayPolicy: 'FULL_TEXT' | 'EXCERPT' | 'LINK_ONLY' | 'INTERNAL_ONLY';
    modelUsePolicy: 'ALLOWED' | 'PROHIBITED';
    supportRole: 'PRIMARY' | 'CONTEXT' | 'LIMITATION';
  }>;
  claims: Array<{
    id: string;
    claimType: 'EFFICACY' | 'RESISTANCE' | 'SAFETY_CONTEXT' | 'OTHER';
    evidenceMaturity:
      | 'MATURE_CLINICAL'
      | 'LIMITED_CLINICAL'
      | 'PRECLINICAL'
      | 'INSUFFICIENT';
    studyType: string;
    studyName: string | null;
    populationSummary: string;
    sampleSize: number | null;
    diseaseStage: string | null;
    treatmentLine: string | null;
    priorTherapy: string | null;
    intervention: string;
    comparator: string | null;
    endpoint: string;
    effectValue: Record<string, unknown> | null;
    conclusion: string;
    limitations: string;
    passageIds: string[];
  }>;
  fieldProvenance: Record<string, string[]>;
  qaIssues: Array<{
    code: string;
    severity: 'INFO' | 'WARNING' | 'BLOCKING';
    message: string;
  }>;
}

export interface CandidateBundle {
  candidateId: string;
  workflowRunId: string | null;
  draftId: string | null;
  draftVersion: number | null;
  reviewTaskId: string | null;
  status: 'READY_FOR_REVIEW' | 'EXCLUDED' | 'NEEDS_HUMAN' | 'FAILED';
  duplicate: boolean;
}

export interface AssociationReviewContext {
  id: string;
  approvedLevel: EvidenceDraftInput['proposedLevel'];
  gradingRationale: string;
  therapyNames?: string[];
  entityIds?: {
    diseaseId: string;
    geneId: string;
    variantId: string;
  };
  eligibilityTerms?: {
    diseases: string[];
    genes: string[];
    variants: string[];
  };
}

export interface CandidateOutcomeReason {
  code: string;
  message: string;
  stage: string;
  ruleVersion?: string;
  retryable: boolean;
}

export interface UpstreamWorkflowRepository {
  getAssociationReviewContext(
    associationId: string
  ): Promise<AssociationReviewContext | null>;
  findDuplicate(source: {
    sourceType: 'PUBMED';
    externalId: string;
    doi: string | null;
    documentHash: string;
  }): Promise<CandidateBundle | null>;
  createCandidateBundle(input: {
    source: CandidateSourceInput & { doi: string | null };
    draft: EvidenceDraftInput;
    ids: {
      candidateId: string;
      workflowRunId: string;
      draftId: string;
      reviewTaskId: string;
    };
    workflowVersion: string;
    agentVersion: string;
    skillVersions: string[];
    skillTraces?: SkillExecutionTrace<unknown>[];
  }): Promise<CandidateBundle>;
  createCandidateOutcome?(input: {
    source: Partial<CandidateSourceInput> & { pmid: string; url: string };
    associationId: string;
    workflowVersion: string;
    status: 'EXCLUDED' | 'NEEDS_HUMAN' | 'FAILED';
    reason: CandidateOutcomeReason;
    skillTraces?: SkillExecutionTrace<unknown>[];
    failedStep?: {
      stepKey: string;
      attempt: number;
      errorCode: string;
      errorSummary: string;
      inputHash: string;
      agentVersionId?: string;
      skillVersionId?: string;
    };
  }): Promise<{
    candidateId: string;
    workflowRunId: string;
    status: 'EXCLUDED' | 'NEEDS_HUMAN' | 'FAILED';
  }>;
  getCandidateRetryContext?(candidateId: string): Promise<{
    pmid: string;
    source: CandidateSourceInput | null;
    association: AssociationReviewContext;
  } | null>;
  saveCandidateRetry?(input: {
    candidateId: string;
    source: CandidateSourceInput;
    draft: EvidenceDraftInput;
    agentVersion: string;
    skillVersions: string[];
    skillTraces: SkillExecutionTrace<unknown>[];
  }): Promise<{ candidateId: string; draftVersion: number; status: string }>;
}

export async function submitPubmedCandidate(_input: {
  source: CandidateSourceInput;
  draft: EvidenceDraftInput;
  repository: UpstreamWorkflowRepository;
  workflowVersion: string;
  agentVersion: string;
  skillVersions: string[];
  skillTraces?: SkillExecutionTrace<unknown>[];
  createId?: () => string;
}): Promise<CandidateBundle> {
  const source = candidateSourceSchema.parse(_input.source);
  const draft = parseEvidenceDraftInput(_input.draft);

  const normalizedSource = {
    ...source,
    doi: normalizeDoi(source.doi),
  };
  const existing = await _input.repository.findDuplicate({
    sourceType: 'PUBMED',
    externalId: normalizedSource.pmid,
    doi: normalizedSource.doi,
    documentHash: normalizedSource.documentHash,
  });
  if (existing) return { ...existing, duplicate: true };

  const createId = _input.createId ?? randomUUID;
  return _input.repository.createCandidateBundle({
    source: normalizedSource,
    draft,
    ids: {
      candidateId: createId(),
      workflowRunId: createId(),
      draftId: createId(),
      reviewTaskId: createId(),
    },
    workflowVersion: nonEmpty(_input.workflowVersion, 'workflowVersion'),
    agentVersion: nonEmpty(_input.agentVersion, 'agentVersion'),
    skillVersions: _input.skillVersions.map((value) =>
      nonEmpty(value, 'skillVersion')
    ),
    skillTraces: _input.skillTraces,
  });
}

const candidateSourceSchema = z.object({
  pmid: z.string().regex(/^[1-9][0-9]{0,9}$/, 'Invalid PMID'),
  title: z.string().trim().min(1),
  abstract: z.string().trim().min(1),
  doi: z.string().trim().min(1).nullable().optional(),
  documentHash: z.string().trim().min(1),
  publicationDate: z.iso.date().nullable().optional(),
  journal: z.string().trim().min(1).nullable().optional(),
  pmcid: z
    .string()
    .regex(/^PMC[1-9][0-9]*$/)
    .nullable()
    .optional(),
  sourceScope: z.enum(['ABSTRACT', 'PMC_FULL_TEXT']).optional(),
  license: z.string().trim().min(1).nullable().optional(),
  licensePolicy: z
    .object({
      decision: z.enum(['ALLOWED', 'REJECTED', 'UNKNOWN']),
      licenseType: z.string().trim().min(1).nullable(),
      licenseText: z.string().trim().min(1).nullable(),
      reason: z.string().trim().min(1),
    })
    .optional(),
  fullText: z.string().trim().min(1).nullable().optional(),
  url: z.url(),
});

const passageSchema = z
  .object({
    id: z.string().trim().min(1),
    text: z.string().trim().min(1),
    textHash: z.string().trim().min(1),
    section: z.string().trim().min(1),
    paragraphIndex: z.number().int().nonnegative(),
    locator: z.record(z.string(), z.unknown()).optional(),
    displayPolicy: z.enum([
      'FULL_TEXT',
      'EXCERPT',
      'LINK_ONLY',
      'INTERNAL_ONLY',
    ]),
    modelUsePolicy: z.enum(['ALLOWED', 'PROHIBITED']),
    supportRole: z.enum(['PRIMARY', 'CONTEXT', 'LIMITATION']),
  })
  .strict();

export const evidenceDraftSchema = z
  .object({
    associationId: z.string().trim().min(1),
    proposedLevel: z.enum(['1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED']),
    gradingRationale: z.string().trim().min(1),
    passages: z.array(passageSchema).min(1),
    claims: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            claimType: z.enum([
              'EFFICACY',
              'RESISTANCE',
              'SAFETY_CONTEXT',
              'OTHER',
            ]),
            evidenceMaturity: z.enum([
              'MATURE_CLINICAL',
              'LIMITED_CLINICAL',
              'PRECLINICAL',
              'INSUFFICIENT',
            ]),
            studyType: z.string().trim().min(1),
            studyName: z.string().trim().min(1).nullable(),
            populationSummary: z.string().trim().min(1),
            sampleSize: z.number().int().positive().nullable(),
            diseaseStage: z.string().trim().min(1).nullable(),
            treatmentLine: z.string().trim().min(1).nullable(),
            priorTherapy: z.string().trim().min(1).nullable(),
            intervention: z.string().trim().min(1),
            comparator: z.string().trim().min(1).nullable(),
            endpoint: z.string().trim().min(1),
            effectValue: z.record(z.string(), z.unknown()).nullable(),
            conclusion: z.string().trim().min(1),
            limitations: z.string().trim().min(1),
            passageIds: z.array(z.string().trim().min(1)).min(1),
          })
          .strict()
      )
      .min(1),
    fieldProvenance: z.record(
      z.string(),
      z.array(z.string().trim().min(1)).min(1)
    ),
    qaIssues: z.array(
      z
        .object({
          code: z.string().trim().min(1),
          severity: z.enum(['INFO', 'WARNING', 'BLOCKING']),
          message: z.string().trim().min(1),
        })
        .strict()
    ),
  })
  .strict();

export function parseEvidenceDraftInput(input: unknown): EvidenceDraftInput {
  const draft = evidenceDraftSchema.parse(input);
  validateDraftTraceability(draft);
  return draft;
}

function nonEmpty(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizeDoi(value: string | null | undefined) {
  if (!value) return null;
  return value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .toLowerCase();
}

function validateDraftTraceability(draft: EvidenceDraftInput) {
  const passages = new Map(
    draft.passages.map((passage) => [passage.id, passage])
  );
  for (const claim of draft.claims) {
    const primary = claim.passageIds
      .map((id) => passages.get(id))
      .find(
        (passage) =>
          passage?.supportRole === 'PRIMARY' &&
          passage.modelUsePolicy === 'ALLOWED'
      );
    if (!primary) {
      throw new Error(
        `Claim ${claim.id} requires a PRIMARY passage with model use ALLOWED`
      );
    }
  }
  for (const [fieldPath, passageIds] of Object.entries(draft.fieldProvenance)) {
    for (const passageId of passageIds) {
      if (!passages.has(passageId)) {
        throw new Error(
          `Field provenance ${fieldPath} references unknown passage ${passageId}`
        );
      }
    }
    const match = fieldPath.match(/^claims\.(\d+)\.([A-Za-z][A-Za-z0-9]*)$/);
    if (match && !draft.claims[Number(match[1])]) {
      throw new Error(`Field provenance ${fieldPath} references unknown claim`);
    }
  }
  if (draft.qaIssues.some((issue) => issue.severity === 'BLOCKING')) {
    throw new Error('Draft contains a BLOCKING QA issue');
  }
}
