import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';

import {
  candidateDocument,
  disease,
  drug,
  evidenceClaim,
  evidenceClaimPassage,
  evidenceDraft,
  gene,
  knowledgeChangeSet,
  knowledgeRelease,
  knowledgeReleaseApproval,
  knowledgeReleaseAssociation,
  knowledgeReleaseClaim,
  platformJob,
  questionRun,
  regulatoryApproval,
  regulatoryApprovalDrug,
  regulatoryApprovalPassage,
  reviewDecision,
  reviewTask,
  sourceDocument,
  sourcePassage,
  therapeuticAssociation,
  therapeuticAssociationDrug,
  userFeedback,
  variant,
  workflowArtifact,
  workflowRun,
  workflowStepRun,
} from '@/config/db/schema';
import type { EvidenceLevel } from '@/shared/types/evidence';
import type {
  KnowledgeEntityListItem,
  KnowledgeRelationSummary,
  PublicEvidenceDetail,
  PublicPassageDetail,
  PublicSourceDetail,
} from '@/shared/types/evidence-platform-api';

import {
  type KnowledgeCatalogItem,
  type KnowledgeCatalogRelease,
  type KnowledgeCatalogRepository,
  type KnowledgeEntityType,
} from './knowledge-catalog';
import type { QuestionEntityCatalog } from './natural-language-question';
import type {
  QuestionRunRecord,
  QuestionRunRepository,
} from './question-workflow';
import {
  ReviewDecisionError,
  type ReviewDecisionResult,
  type ReviewPublishRepository,
  type ReviewTaskSnapshot,
} from './review-publish';
import { hashArtifact } from './skill-runtime';
import {
  parseEvidenceDraftInput,
  type AssociationReviewContext,
  type CandidateBundle,
  type CandidateSourceInput,
  type UpstreamWorkflowRepository,
} from './upstream-workflow';

type Database = any;

function iso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeItem(item: KnowledgeCatalogItem) {
  return {
    ...item,
    aliases: [...new Set(item.aliases)].sort((left, right) =>
      left.localeCompare(right, 'en')
    ),
  };
}

export function createPostgresUpstreamWorkflowRepository(
  database: Database
): UpstreamWorkflowRepository {
  async function getAssociationReviewContext(
    associationId: string
  ): Promise<AssociationReviewContext | null> {
    const rows = await database
      .select({
        id: therapeuticAssociation.id,
        diseaseId: therapeuticAssociation.diseaseId,
        geneId: variant.geneId,
        variantId: therapeuticAssociation.variantId,
        approvedLevel: therapeuticAssociation.approvedLevel,
        gradingRationale: therapeuticAssociation.gradingRationale,
        reviewStatus: therapeuticAssociation.reviewStatus,
        diseaseCanonicalName: disease.canonicalName,
        diseaseDisplayNameZh: disease.displayNameZh,
        diseaseDisplayNameEn: disease.displayNameEn,
        diseaseAliases: disease.aliases,
        geneSymbol: gene.symbol,
        geneName: gene.name,
        geneAliases: gene.aliases,
        variantCanonicalKey: variant.canonicalKey,
        variantHgvsp: variant.hgvsp,
        variantHgvsc: variant.hgvsc,
        variantAliases: variant.aliases,
      })
      .from(therapeuticAssociation)
      .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .innerJoin(gene, eq(variant.geneId, gene.id))
      .where(eq(therapeuticAssociation.id, associationId))
      .limit(1);
    const row = rows[0];
    if (!row || row.reviewStatus !== 'APPROVED' || !row.approvedLevel) {
      return null;
    }
    const therapyRows = await database
      .select({ genericName: drug.genericName })
      .from(therapeuticAssociationDrug)
      .innerJoin(drug, eq(therapeuticAssociationDrug.drugId, drug.id))
      .where(eq(therapeuticAssociationDrug.associationId, row.id))
      .orderBy(asc(therapeuticAssociationDrug.sortOrder));
    return {
      id: row.id,
      approvedLevel: row.approvedLevel,
      gradingRationale: row.gradingRationale,
      therapyNames: therapyRows.map(
        (therapy: { genericName: string }) => therapy.genericName
      ),
      entityIds: {
        diseaseId: row.diseaseId,
        geneId: row.geneId,
        variantId: row.variantId,
      },
      eligibilityTerms: {
        diseases: uniqueBy(
          [
            row.diseaseCanonicalName,
            row.diseaseDisplayNameZh,
            row.diseaseDisplayNameEn,
            ...asStringArray(row.diseaseAliases),
          ].filter(Boolean),
          (value) => value
        ),
        genes: uniqueBy(
          [
            row.geneSymbol,
            row.geneName,
            ...asStringArray(row.geneAliases),
          ].filter(Boolean),
          (value) => value
        ),
        variants: uniqueBy(
          [
            row.variantCanonicalKey,
            row.variantHgvsp,
            row.variantHgvsc,
            ...asStringArray(row.variantAliases),
          ].filter((value): value is string => Boolean(value)),
          (value) => value
        ),
      },
    };
  }

  async function findDuplicate(source: {
    sourceType: 'PUBMED';
    externalId: string;
    doi: string | null;
    documentHash: string;
  }): Promise<CandidateBundle | null> {
    const identities = [
      and(
        eq(candidateDocument.sourceType, source.sourceType),
        eq(candidateDocument.externalId, source.externalId)
      ),
      ...(source.doi ? [eq(candidateDocument.doi, source.doi)] : []),
      eq(candidateDocument.documentHash, source.documentHash),
    ];
    const rows = await database
      .select({
        candidateId: candidateDocument.id,
        workflowRunId: workflowRun.id,
        draftId: evidenceDraft.id,
        draftVersion: evidenceDraft.draftVersion,
        reviewTaskId: reviewTask.id,
        status: candidateDocument.status,
      })
      .from(candidateDocument)
      .leftJoin(
        workflowRun,
        eq(candidateDocument.activeWorkflowRunId, workflowRun.id)
      )
      .leftJoin(
        evidenceDraft,
        eq(evidenceDraft.candidateDocumentId, candidateDocument.id)
      )
      .leftJoin(reviewTask, eq(reviewTask.evidenceDraftId, evidenceDraft.id))
      .where(or(...identities))
      .orderBy(candidateDocument.createdAt, evidenceDraft.draftVersion)
      .limit(1);
    if (rows.length === 0) return null;
    return {
      candidateId: rows[0].candidateId,
      workflowRunId: rows[0].workflowRunId,
      draftId: rows[0].draftId,
      draftVersion: rows[0].draftVersion,
      reviewTaskId: rows[0].reviewTaskId,
      status: rows[0].status as CandidateBundle['status'],
      duplicate: false,
    };
  }

  async function createCandidateOutcome(
    input: Parameters<
      NonNullable<UpstreamWorkflowRepository['createCandidateOutcome']>
    >[0]
  ) {
    const existing = await database
      .select({
        candidateId: candidateDocument.id,
        workflowRunId: candidateDocument.activeWorkflowRunId,
        status: candidateDocument.status,
      })
      .from(candidateDocument)
      .where(
        and(
          eq(candidateDocument.sourceType, 'PUBMED'),
          eq(candidateDocument.externalId, input.source.pmid)
        )
      )
      .limit(1);
    if (existing.length && existing[0].workflowRunId) {
      return {
        candidateId: existing[0].candidateId,
        workflowRunId: existing[0].workflowRunId,
        status: existing[0].status as 'EXCLUDED' | 'NEEDS_HUMAN' | 'FAILED',
      };
    }
    const candidateId = randomUUID();
    const workflowRunId = randomUUID();
    const timestamp = new Date();
    const source = {
      pmid: input.source.pmid,
      title: input.source.title ?? `PubMed PMID ${input.source.pmid}`,
      abstract: input.source.abstract ?? 'Metadata retrieval did not complete.',
      doi: input.source.doi ?? null,
      documentHash: input.source.documentHash ?? null,
      publicationDate: input.source.publicationDate ?? null,
      journal: input.source.journal ?? null,
      pmcid: input.source.pmcid ?? null,
      sourceScope: input.source.sourceScope ?? 'ABSTRACT',
      license: input.source.license ?? null,
      licensePolicy: input.source.licensePolicy ?? null,
      fullText: input.source.fullText ?? null,
      url:
        input.source.url ||
        `https://pubmed.ncbi.nlm.nih.gov/${input.source.pmid}/`,
    };
    const inputHash = hashArtifact({
      source,
      associationId: input.associationId,
    });
    const outputHash = hashArtifact(input.reason);
    await database.transaction(async (transaction: Database) => {
      await transaction.insert(workflowRun).values({
        id: workflowRunId,
        workflowVersion: input.workflowVersion,
        kind: 'UPSTREAM',
        idempotencyKey: `${input.workflowVersion}:PUBMED:${input.source.pmid}`,
        status:
          input.status === 'EXCLUDED'
            ? 'SUCCEEDED'
            : input.status === 'NEEDS_HUMAN'
              ? 'NEEDS_HUMAN'
              : 'FAILED',
        currentStep:
          input.status === 'EXCLUDED'
            ? 'eligibility_excluded'
            : input.reason.stage,
        inputHash,
        outputHash,
        errorCode: input.status === 'EXCLUDED' ? null : input.reason.code,
        startedAt: timestamp,
        completedAt: input.status === 'NEEDS_HUMAN' ? null : timestamp,
      });
      await transaction.insert(candidateDocument).values({
        id: candidateId,
        sourceType: 'PUBMED',
        externalId: source.pmid,
        doi: source.doi,
        documentHash: source.documentHash,
        title: source.title,
        abstract: source.abstract,
        journal: source.journal,
        publicationDate: source.publicationDate,
        pmcid: source.pmcid,
        sourceScope: source.sourceScope,
        sourceLicense: source.license,
        sourceLicensePolicy: source.licensePolicy,
        fullText: source.fullText,
        sourceUrl: source.url,
        matchedStrategyIds: [],
        status: input.status,
        exclusionReason: input.reason,
        activeWorkflowRunId: workflowRunId,
      });
      const sourceArtifactId = `${workflowRunId}:source`;
      await transaction.insert(workflowArtifact).values([
        {
          id: sourceArtifactId,
          workflowRunId,
          artifactType: 'CandidateDocument',
          schemaVersion: '1',
          createdByType: 'SYSTEM',
          createdById: 'pubmed-source-adapter',
          inputArtifactIds: [],
          content: source,
          contentHash: hashArtifact(source),
          sensitivity: 'INTERNAL',
          publicPolicy: 'SUMMARY_ONLY',
        },
        {
          id: `${workflowRunId}:context`,
          workflowRunId,
          artifactType: 'WorkflowContext',
          schemaVersion: '1',
          createdByType: 'SYSTEM',
          createdById: 'knowledge-ops-planner',
          inputArtifactIds: [sourceArtifactId],
          content: { associationId: input.associationId },
          contentHash: hashArtifact({ associationId: input.associationId }),
          sensitivity: 'INTERNAL',
          publicPolicy: 'INTERNAL_ONLY',
        },
        {
          id: `${workflowRunId}:outcome`,
          workflowRunId,
          artifactType:
            input.status === 'EXCLUDED'
              ? 'EligibilityDecision'
              : 'WorkflowFailure',
          schemaVersion: '1',
          createdByType: 'SYSTEM',
          createdById: 'knowledge-ops-planner',
          inputArtifactIds: [sourceArtifactId],
          content: input.reason,
          contentHash: outputHash,
          sensitivity: 'INTERNAL',
          publicPolicy: 'INTERNAL_ONLY',
        },
      ]);
      const steps: any[] = (input.skillTraces ?? []).map((trace) => ({
        id: `${workflowRunId}:${trace.skillId}:${trace.attempt}`,
        workflowRunId,
        stepKey: trace.skillId,
        attempt: trace.attempt,
        status: 'SUCCEEDED' as const,
        skillVersionId: `${trace.skillId}@${trace.skillVersion}`,
        agentVersionId: `${trace.agentId}@${trace.agentVersion}`,
        inputHash: trace.inputHash,
        outputHash: trace.outputHash,
        startedAt: timestamp,
        completedAt: new Date(timestamp.getTime() + trace.durationMs),
      }));
      if (input.failedStep) {
        steps.push({
          id: `${workflowRunId}:${input.failedStep.stepKey}:${input.failedStep.attempt}`,
          workflowRunId,
          stepKey: input.failedStep.stepKey,
          attempt: input.failedStep.attempt,
          status: 'FAILED',
          skillVersionId: input.failedStep.skillVersionId,
          agentVersionId: input.failedStep.agentVersionId,
          inputHash: input.failedStep.inputHash,
          outputHash: null,
          errorCode: input.failedStep.errorCode,
          errorSummary: input.failedStep.errorSummary.slice(0, 2_000),
          startedAt: timestamp,
          completedAt: timestamp,
        });
      }
      if (steps.length) await transaction.insert(workflowStepRun).values(steps);
    });
    return { candidateId, workflowRunId, status: input.status };
  }

  async function createCandidateBundle(
    input: Parameters<UpstreamWorkflowRepository['createCandidateBundle']>[0]
  ): Promise<CandidateBundle> {
    const timestamp = new Date();
    const inputHash = hashArtifact(input.source);
    const outputHash = hashArtifact(input.draft);
    const traces = input.skillTraces ?? [];
    const traceArtifacts = traces.map((trace, index) => ({
      id: `${input.ids.workflowRunId}:trace:${index + 1}`,
      workflowRunId: input.ids.workflowRunId,
      artifactType: traceArtifactType(trace.skillId),
      schemaVersion: '1',
      createdByType: 'SKILL' as const,
      createdById: `${trace.skillId}@${trace.skillVersion}`,
      inputArtifactIds: [
        index === 0
          ? `${input.ids.workflowRunId}:source`
          : `${input.ids.workflowRunId}:trace:${index}`,
      ],
      content: trace.output,
      contentHash: trace.outputHash,
      sensitivity: 'INTERNAL' as const,
      publicPolicy: 'INTERNAL_ONLY' as const,
    }));
    try {
      return await database.transaction(async (transaction: Database) => {
        await transaction.insert(workflowRun).values({
          id: input.ids.workflowRunId,
          workflowVersion: input.workflowVersion,
          kind: 'UPSTREAM',
          idempotencyKey: `${input.workflowVersion}:PUBMED:${input.source.pmid}`,
          status: 'NEEDS_HUMAN',
          currentStep: 'human_review',
          inputHash,
          outputHash,
          startedAt: timestamp,
          completedAt: null,
        });
        await transaction.insert(candidateDocument).values({
          id: input.ids.candidateId,
          sourceType: 'PUBMED',
          externalId: input.source.pmid,
          doi: input.source.doi,
          documentHash: input.source.documentHash,
          title: input.source.title,
          abstract: input.source.abstract,
          journal: input.source.journal ?? null,
          publicationDate: input.source.publicationDate ?? null,
          pmcid: input.source.pmcid ?? null,
          sourceScope: input.source.sourceScope ?? 'ABSTRACT',
          sourceLicense: input.source.license ?? null,
          sourceLicensePolicy: input.source.licensePolicy ?? null,
          fullText: input.source.fullText ?? null,
          sourceUrl: input.source.url,
          matchedStrategyIds: [],
          status: 'READY_FOR_REVIEW',
          activeWorkflowRunId: input.ids.workflowRunId,
        });
        await transaction.insert(evidenceDraft).values({
          id: input.ids.draftId,
          candidateDocumentId: input.ids.candidateId,
          workflowRunId: input.ids.workflowRunId,
          associationId: input.draft.associationId,
          draftVersion: 1,
          status: 'READY_FOR_REVIEW',
          payload: input.draft,
          fieldProvenance: input.draft.fieldProvenance,
          agentVersion: input.agentVersion,
          skillVersions: input.skillVersions,
          proposedLevel: input.draft.proposedLevel,
          gradingRationale: input.draft.gradingRationale,
          qaIssues: input.draft.qaIssues,
        });
        await transaction.insert(reviewTask).values({
          id: input.ids.reviewTaskId,
          candidateDocumentId: input.ids.candidateId,
          evidenceDraftId: input.ids.draftId,
          draftVersion: 1,
          status: 'READY_FOR_REVIEW',
          lockVersion: 1,
        });
        await transaction.insert(workflowArtifact).values([
          {
            id: `${input.ids.workflowRunId}:source`,
            workflowRunId: input.ids.workflowRunId,
            artifactType: 'CandidateDocument',
            schemaVersion: '1',
            createdByType: 'SYSTEM',
            createdById: 'pubmed-source-adapter',
            inputArtifactIds: [],
            content: input.source,
            contentHash: inputHash,
            sensitivity: 'INTERNAL',
            publicPolicy: 'SUMMARY_ONLY',
          },
          ...traceArtifacts,
          {
            id: `${input.ids.workflowRunId}:draft`,
            workflowRunId: input.ids.workflowRunId,
            artifactType: 'ExtractedEvidenceDraft',
            schemaVersion: '1',
            createdByType: 'AGENT',
            createdById: input.agentVersion,
            inputArtifactIds: [`${input.ids.workflowRunId}:source`],
            content: input.draft,
            contentHash: outputHash,
            sensitivity: 'INTERNAL',
            publicPolicy: 'INTERNAL_ONLY',
          },
          {
            id: `${input.ids.workflowRunId}:grade`,
            workflowRunId: input.ids.workflowRunId,
            artifactType: 'GradingProposal',
            schemaVersion: '1',
            createdByType: 'SKILL',
            createdById: 'propose_evidence_level@1.0.0',
            inputArtifactIds: [`${input.ids.workflowRunId}:draft`],
            content: {
              proposedLevel: input.draft.proposedLevel,
              gradingRationale: input.draft.gradingRationale,
            },
            contentHash: hashArtifact({
              proposedLevel: input.draft.proposedLevel,
              gradingRationale: input.draft.gradingRationale,
            }),
            sensitivity: 'INTERNAL',
            publicPolicy: 'INTERNAL_ONLY',
          },
          {
            id: `${input.ids.workflowRunId}:qa`,
            workflowRunId: input.ids.workflowRunId,
            artifactType: 'IngestionQAReport',
            schemaVersion: '1',
            createdByType: 'SKILL',
            createdById: 'validate_draft_completeness@1.0.0',
            inputArtifactIds: [`${input.ids.workflowRunId}:draft`],
            content: { issues: input.draft.qaIssues },
            contentHash: hashArtifact({ issues: input.draft.qaIssues }),
            sensitivity: 'INTERNAL',
            publicPolicy: 'INTERNAL_ONLY',
          },
        ]);
        await transaction.insert(workflowStepRun).values(
          traces.length
            ? traces.map((trace) => ({
                id: `${input.ids.workflowRunId}:${trace.skillId}:${trace.attempt}`,
                workflowRunId: input.ids.workflowRunId,
                stepKey: trace.skillId,
                attempt: trace.attempt,
                status: 'SUCCEEDED' as const,
                skillVersionId: `${trace.skillId}@${trace.skillVersion}`,
                agentVersionId: `${trace.agentId}@${trace.agentVersion}`,
                inputHash: trace.inputHash,
                outputHash: trace.outputHash,
                startedAt: timestamp,
                completedAt: new Date(timestamp.getTime() + trace.durationMs),
              }))
            : [
                {
                  id: `${input.ids.workflowRunId}:validate:1`,
                  workflowRunId: input.ids.workflowRunId,
                  stepKey: 'validate_draft_completeness',
                  attempt: 1,
                  status: 'SUCCEEDED' as const,
                  inputHash: outputHash,
                  outputHash,
                  startedAt: timestamp,
                  completedAt: timestamp,
                },
              ]
        );
        return {
          ...input.ids,
          draftVersion: 1,
          status: 'READY_FOR_REVIEW' as const,
          duplicate: false,
        };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        const duplicate = await findDuplicate({
          sourceType: 'PUBMED',
          externalId: input.source.pmid,
          doi: input.source.doi,
          documentHash: input.source.documentHash,
        });
        if (duplicate) return { ...duplicate, duplicate: true };
      }
      throw error;
    }
  }

  async function getCandidateRetryContext(candidateId: string) {
    const rows = await database
      .select({
        status: candidateDocument.status,
        pmid: candidateDocument.externalId,
        title: candidateDocument.title,
        abstract: candidateDocument.abstract,
        doi: candidateDocument.doi,
        documentHash: candidateDocument.documentHash,
        publicationDate: candidateDocument.publicationDate,
        journal: candidateDocument.journal,
        pmcid: candidateDocument.pmcid,
        sourceScope: candidateDocument.sourceScope,
        license: candidateDocument.sourceLicense,
        licensePolicy: candidateDocument.sourceLicensePolicy,
        fullText: candidateDocument.fullText,
        url: candidateDocument.sourceUrl,
        workflowRunId: candidateDocument.activeWorkflowRunId,
        associationId: evidenceDraft.associationId,
      })
      .from(candidateDocument)
      .leftJoin(
        evidenceDraft,
        eq(evidenceDraft.candidateDocumentId, candidateDocument.id)
      )
      .where(eq(candidateDocument.id, candidateId))
      .orderBy(desc(evidenceDraft.draftVersion))
      .limit(1);
    const row = rows[0];
    if (!row || row.status !== 'QUEUED') return null;
    let associationId = row.associationId;
    if (!associationId && row.workflowRunId) {
      const contexts = await database
        .select({ content: workflowArtifact.content })
        .from(workflowArtifact)
        .where(
          and(
            eq(workflowArtifact.workflowRunId, row.workflowRunId),
            eq(workflowArtifact.artifactType, 'WorkflowContext')
          )
        )
        .orderBy(desc(workflowArtifact.createdAt))
        .limit(1);
      const content = contexts[0]?.content as
        | { associationId?: unknown }
        | undefined;
      associationId =
        typeof content?.associationId === 'string'
          ? content.associationId
          : null;
    }
    if (!associationId) return null;
    const association = await getAssociationReviewContext(associationId);
    if (!association) return null;
    return {
      pmid: row.pmid,
      source: row.documentHash
        ? {
            pmid: row.pmid,
            title: row.title,
            abstract: row.abstract,
            doi: row.doi,
            documentHash: row.documentHash,
            publicationDate: row.publicationDate,
            journal: row.journal,
            pmcid: row.pmcid,
            sourceScope: row.sourceScope,
            license: row.license,
            licensePolicy:
              row.licensePolicy && typeof row.licensePolicy === 'object'
                ? (row.licensePolicy as CandidateSourceInput['licensePolicy'])
                : undefined,
            fullText: row.fullText,
            url: row.url,
          }
        : null,
      association,
    };
  }

  async function saveCandidateRetry(
    input: Parameters<
      NonNullable<UpstreamWorkflowRepository['saveCandidateRetry']>
    >[0]
  ) {
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select({
          candidateStatus: candidateDocument.status,
          workflowRunId: candidateDocument.activeWorkflowRunId,
          draftId: evidenceDraft.id,
          draftVersion: evidenceDraft.draftVersion,
        })
        .from(candidateDocument)
        .leftJoin(
          evidenceDraft,
          eq(evidenceDraft.candidateDocumentId, candidateDocument.id)
        )
        .where(eq(candidateDocument.id, input.candidateId))
        .orderBy(desc(evidenceDraft.draftVersion))
        .for('update')
        .limit(1);
      const row = rows[0];
      if (!row || row.candidateStatus !== 'QUEUED' || !row.workflowRunId) {
        return {
          candidateId: input.candidateId,
          draftVersion: row?.draftVersion ?? 0,
          status: 'ALREADY_PROCESSED',
        };
      }
      const timestamp = new Date();
      const draftVersion = (row.draftVersion ?? 0) + 1;
      const draftId = randomUUID();
      await transaction.insert(evidenceDraft).values({
        id: draftId,
        candidateDocumentId: input.candidateId,
        workflowRunId: row.workflowRunId,
        associationId: input.draft.associationId,
        draftVersion,
        status: 'READY_FOR_REVIEW',
        payload: input.draft,
        fieldProvenance: input.draft.fieldProvenance,
        agentVersion: input.agentVersion,
        skillVersions: input.skillVersions,
        proposedLevel: input.draft.proposedLevel,
        gradingRationale: input.draft.gradingRationale,
        qaIssues: input.draft.qaIssues,
        parentDraftId: row.draftId ?? null,
      });
      const reviewRows = await transaction
        .update(reviewTask)
        .set({
          evidenceDraftId: draftId,
          draftVersion,
          lockVersion: draftVersion,
          status: 'READY_FOR_REVIEW',
        })
        .where(
          and(
            eq(reviewTask.candidateDocumentId, input.candidateId),
            inArray(reviewTask.status, [
              'PENDING',
              'IN_REVIEW',
              'REQUESTED_CHANGES',
              'READY_FOR_REVIEW',
              'PUBLISH_FAILED',
            ])
          )
        )
        .returning({ id: reviewTask.id });
      if (!reviewRows.length) {
        await transaction.insert(reviewTask).values({
          id: randomUUID(),
          candidateDocumentId: input.candidateId,
          evidenceDraftId: draftId,
          draftVersion,
          status: 'READY_FOR_REVIEW',
          lockVersion: draftVersion,
        });
      }
      const outputHash = hashArtifact(input.draft);
      await transaction
        .insert(workflowArtifact)
        .values({
          id: randomUUID(),
          workflowRunId: row.workflowRunId,
          artifactType: 'ExtractedEvidenceDraft',
          schemaVersion: '1',
          createdByType: 'AGENT',
          createdById: input.agentVersion,
          inputArtifactIds: [],
          content: input.draft,
          contentHash: outputHash,
          sensitivity: 'INTERNAL',
          publicPolicy: 'INTERNAL_ONLY',
        })
        .onConflictDoNothing();
      await transaction.insert(workflowStepRun).values(
        input.skillTraces.map((trace) => ({
          id: randomUUID(),
          workflowRunId: row.workflowRunId!,
          stepKey: trace.skillId,
          attempt: draftVersion,
          status: 'SUCCEEDED' as const,
          skillVersionId: `${trace.skillId}@${trace.skillVersion}`,
          agentVersionId: `${trace.agentId}@${trace.agentVersion}`,
          inputHash: trace.inputHash,
          outputHash: trace.outputHash,
          startedAt: timestamp,
          completedAt: new Date(timestamp.getTime() + trace.durationMs),
        }))
      );
      await transaction
        .update(candidateDocument)
        .set({
          status: 'READY_FOR_REVIEW',
          title: input.source.title,
          abstract: input.source.abstract,
          doi: input.source.doi ?? null,
          documentHash: input.source.documentHash,
          publicationDate: input.source.publicationDate ?? null,
          journal: input.source.journal ?? null,
          pmcid: input.source.pmcid ?? null,
          sourceScope: input.source.sourceScope ?? 'ABSTRACT',
          sourceLicense: input.source.license ?? null,
          sourceLicensePolicy: input.source.licensePolicy ?? null,
          fullText: input.source.fullText ?? null,
          sourceUrl: input.source.url,
          exclusionReason: null,
        })
        .where(eq(candidateDocument.id, input.candidateId));
      await transaction
        .update(workflowRun)
        .set({
          status: 'NEEDS_HUMAN',
          currentStep: 'human_review',
          outputHash,
          completedAt: null,
        })
        .where(eq(workflowRun.id, row.workflowRunId));
      return {
        candidateId: input.candidateId,
        draftVersion,
        status: 'READY_FOR_REVIEW',
      };
    });
  }

  return {
    getAssociationReviewContext,
    findDuplicate,
    createCandidateBundle,
    createCandidateOutcome,
    getCandidateRetryContext,
    saveCandidateRetry,
  };
}

function nextPatchVersion(version: string) {
  const match = version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Cannot create patch release after ${version}`);
  return `v${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function reviewResult(row: any, idempotent = false): ReviewDecisionResult {
  return {
    reviewTaskId: row.reviewTaskId,
    decision: row.decision,
    status: row.taskStatus,
    releaseId: row.resultReleaseId ?? null,
    releaseVersion: row.releaseVersion ?? null,
    idempotent,
  };
}

export function createPostgresReviewPublishRepository(
  database: Database,
  options: { now?: () => Date; createId?: () => string } = {}
): ReviewPublishRepository {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;

  async function findDecision(
    idempotencyKey: string
  ): Promise<ReviewDecisionResult | null> {
    const rows = await database
      .select({
        reviewTaskId: reviewDecision.reviewTaskId,
        decision: reviewDecision.decision,
        taskStatus: reviewTask.status,
        resultReleaseId: reviewDecision.resultReleaseId,
        releaseVersion: knowledgeRelease.version,
      })
      .from(reviewDecision)
      .innerJoin(reviewTask, eq(reviewDecision.reviewTaskId, reviewTask.id))
      .leftJoin(
        knowledgeRelease,
        eq(reviewDecision.resultReleaseId, knowledgeRelease.id)
      )
      .where(eq(reviewDecision.idempotencyKey, idempotencyKey))
      .limit(1);
    return rows.length ? reviewResult(rows[0]) : null;
  }

  async function getReviewTask(
    reviewTaskId: string
  ): Promise<ReviewTaskSnapshot | null> {
    const rows = await database
      .select({
        id: reviewTask.id,
        status: reviewTask.status,
        draftId: reviewTask.evidenceDraftId,
        draftVersion: reviewTask.draftVersion,
        lockVersion: reviewTask.lockVersion,
        assignedTo: reviewTask.assignedTo,
        candidateId: candidateDocument.id,
        sourceType: candidateDocument.sourceType,
        externalId: candidateDocument.externalId,
        title: candidateDocument.title,
        abstract: candidateDocument.abstract,
        journal: candidateDocument.journal,
        publicationDate: candidateDocument.publicationDate,
        doi: candidateDocument.doi,
        pmcid: candidateDocument.pmcid,
        sourceScope: candidateDocument.sourceScope,
        sourceLicense: candidateDocument.sourceLicense,
        sourceLicensePolicy: candidateDocument.sourceLicensePolicy,
        sourceUrl: candidateDocument.sourceUrl,
        draftPayload: evidenceDraft.payload,
        workflowRunId: evidenceDraft.workflowRunId,
        fieldProvenance: evidenceDraft.fieldProvenance,
        agentVersion: evidenceDraft.agentVersion,
        skillVersions: evidenceDraft.skillVersions,
        editedBy: evidenceDraft.editedBy,
        editReason: evidenceDraft.editReason,
        qaIssues: evidenceDraft.qaIssues,
        publishedReleaseId: reviewTask.publishedReleaseId,
      })
      .from(reviewTask)
      .innerJoin(
        evidenceDraft,
        eq(reviewTask.evidenceDraftId, evidenceDraft.id)
      )
      .innerJoin(
        candidateDocument,
        eq(reviewTask.candidateDocumentId, candidateDocument.id)
      )
      .where(eq(reviewTask.id, reviewTaskId))
      .limit(1);
    if (rows.length === 0) return null;
    const issues = Array.isArray(rows[0].qaIssues) ? rows[0].qaIssues : [];
    const [decisions, releases] = await Promise.all([
      database
        .select({
          id: reviewDecision.id,
          decision: reviewDecision.decision,
          expectedDraftVersion: reviewDecision.expectedDraftVersion,
          actorId: reviewDecision.actorId,
          comment: reviewDecision.comment,
          requestedFields: reviewDecision.requestedFields,
          resultReleaseId: reviewDecision.resultReleaseId,
          createdAt: reviewDecision.createdAt,
        })
        .from(reviewDecision)
        .where(eq(reviewDecision.reviewTaskId, reviewTaskId))
        .orderBy(reviewDecision.createdAt),
      database
        .select({ id: knowledgeRelease.id, version: knowledgeRelease.version })
        .from(knowledgeRelease)
        .where(eq(knowledgeRelease.status, 'PUBLISHED'))
        .orderBy(desc(knowledgeRelease.publishedAt), desc(knowledgeRelease.id))
        .limit(1),
    ]);
    const currentRelease = releases[0] ?? null;
    const parsedDraft = parseEvidenceDraftInput(rows[0].draftPayload);
    const currentAssociation = currentRelease
      ? ((
          await database
            .select({
              approvedLevel: knowledgeReleaseAssociation.approvedLevel,
              gradingRationale: knowledgeReleaseAssociation.gradingRationale,
            })
            .from(knowledgeReleaseAssociation)
            .where(
              and(
                eq(
                  knowledgeReleaseAssociation.knowledgeReleaseId,
                  currentRelease.id
                ),
                eq(
                  knowledgeReleaseAssociation.therapeuticAssociationId,
                  parsedDraft.associationId
                )
              )
            )
            .limit(1)
        )[0] ?? null)
      : null;
    const expectedNextRelease = currentRelease
      ? nextPatchVersion(currentRelease.version)
      : null;
    return {
      id: rows[0].id,
      status: rows[0].status,
      draftId: rows[0].draftId,
      draftVersion: rows[0].draftVersion,
      lockVersion: rows[0].lockVersion,
      assignedTo: rows[0].assignedTo,
      hasBlockingIssues: issues.some(
        (issue: any) => issue?.severity === 'BLOCKING'
      ),
      publishedReleaseId: rows[0].publishedReleaseId,
      candidate: {
        id: rows[0].candidateId,
        sourceType: rows[0].sourceType,
        externalId: rows[0].externalId,
        title: rows[0].title,
        abstract: rows[0].abstract,
        journal: rows[0].journal,
        publicationDate: rows[0].publicationDate,
        doi: rows[0].doi,
        pmcid: rows[0].pmcid,
        sourceScope: rows[0].sourceScope,
        license: rows[0].sourceLicense,
        licensePolicy:
          rows[0].sourceLicensePolicy &&
          typeof rows[0].sourceLicensePolicy === 'object'
            ? (rows[0]
                .sourceLicensePolicy as CandidateSourceInput['licensePolicy'])
            : undefined,
        sourceUrl: rows[0].sourceUrl,
      },
      draft: parsedDraft,
      draftMetadata: {
        agentVersion: rows[0].agentVersion,
        skillVersions: asStringArray(rows[0].skillVersions),
        fieldProvenance:
          rows[0].fieldProvenance && typeof rows[0].fieldProvenance === 'object'
            ? rows[0].fieldProvenance
            : {},
        editedBy: rows[0].editedBy,
        editReason: rows[0].editReason,
      },
      history: decisions.map((decision: any) => ({
        ...decision,
        requestedFields: asStringArray(decision.requestedFields),
        createdAt: iso(decision.createdAt),
      })),
      workflowRunId: rows[0].workflowRunId,
      currentRelease,
      expectedNextRelease,
      publicationPreview: {
        currentApprovedLevel: currentAssociation?.approvedLevel ?? null,
        currentGradingRationale: currentAssociation?.gradingRationale ?? null,
        proposedApprovedLevel: parsedDraft.proposedLevel as EvidenceLevel,
        proposedGradingRationale: parsedDraft.gradingRationale,
        levelChanged:
          currentAssociation?.approvedLevel !== parsedDraft.proposedLevel,
        newClaimCount: parsedDraft.claims.length,
        modifiedClaimCount: 0,
        source: {
          sourceType: rows[0].sourceType,
          externalId: rows[0].externalId,
          sourceScope: rows[0].sourceScope,
        },
        currentRelease,
        expectedNextRelease,
      },
    };
  }

  async function saveNonPublishDecision(
    input: Parameters<ReviewPublishRepository['saveNonPublishDecision']>[0]
  ): Promise<ReviewDecisionResult> {
    try {
      return await database.transaction(async (transaction: Database) => {
        const rows = await transaction
          .select({
            draftId: reviewTask.evidenceDraftId,
            candidateId: reviewTask.candidateDocumentId,
            draftVersion: reviewTask.draftVersion,
            taskStatus: reviewTask.status,
            workflowRunId: evidenceDraft.workflowRunId,
          })
          .from(reviewTask)
          .innerJoin(
            evidenceDraft,
            eq(reviewTask.evidenceDraftId, evidenceDraft.id)
          )
          .where(eq(reviewTask.id, input.reviewTaskId))
          .for('update')
          .limit(1);
        if (rows.length === 0) {
          throw new ReviewDecisionError(
            'REVIEW_TASK_NOT_FOUND',
            `Review task ${input.reviewTaskId} was not found`
          );
        }
        if (rows[0].draftVersion !== input.expectedDraftVersion) {
          throw new ReviewDecisionError(
            'DRAFT_VERSION_CONFLICT',
            `Expected draft version ${input.expectedDraftVersion}, current version is ${rows[0].draftVersion}`
          );
        }
        if (
          !['PENDING', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(
            rows[0].taskStatus
          )
        ) {
          throw new ReviewDecisionError(
            'INVALID_REVIEW_STATE',
            `Review task ${input.reviewTaskId} is ${rows[0].taskStatus}`
          );
        }
        const status =
          input.decision === 'REJECT' ? 'REJECTED' : 'REQUESTED_CHANGES';
        await transaction.insert(reviewDecision).values({
          id: createId(),
          reviewTaskId: input.reviewTaskId,
          decision: input.decision,
          expectedDraftVersion: input.expectedDraftVersion,
          actorId: input.actorId,
          comment: input.comment,
          requestedFields: input.requestedFields,
          idempotencyKey: input.idempotencyKey,
        });
        await transaction
          .update(reviewTask)
          .set({ status, lockVersion: input.expectedDraftVersion + 1 })
          .where(eq(reviewTask.id, input.reviewTaskId));
        await transaction
          .update(evidenceDraft)
          .set({ status: input.decision === 'REJECT' ? 'REJECTED' : 'DRAFT' })
          .where(eq(evidenceDraft.id, rows[0].draftId));
        await transaction
          .update(candidateDocument)
          .set({
            status: input.decision === 'REJECT' ? 'REJECTED' : 'NEEDS_HUMAN',
          })
          .where(eq(candidateDocument.id, rows[0].candidateId));
        await transaction
          .update(workflowRun)
          .set({
            status: input.decision === 'REJECT' ? 'FAILED' : 'NEEDS_HUMAN',
            currentStep: status.toLowerCase(),
          })
          .where(eq(workflowRun.id, rows[0].workflowRunId));
        return {
          reviewTaskId: input.reviewTaskId,
          decision: input.decision,
          status,
          releaseId: null,
          releaseVersion: null,
          idempotent: false,
        };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        const previous = await findDecision(input.idempotencyKey);
        if (previous) return { ...previous, idempotent: true };
      }
      throw error;
    }
  }

  async function publishApprovedReview(
    input: Parameters<ReviewPublishRepository['publishApprovedReview']>[0]
  ): Promise<ReviewDecisionResult> {
    try {
      return await database.transaction(async (transaction: Database) => {
        const existingRows = await transaction
          .select({
            reviewTaskId: reviewDecision.reviewTaskId,
            decision: reviewDecision.decision,
            taskStatus: reviewTask.status,
            resultReleaseId: reviewDecision.resultReleaseId,
            releaseVersion: knowledgeRelease.version,
          })
          .from(reviewDecision)
          .innerJoin(reviewTask, eq(reviewDecision.reviewTaskId, reviewTask.id))
          .leftJoin(
            knowledgeRelease,
            eq(reviewDecision.resultReleaseId, knowledgeRelease.id)
          )
          .where(eq(reviewDecision.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (existingRows.length) return reviewResult(existingRows[0], true);

        const rows = await transaction
          .select({
            taskStatus: reviewTask.status,
            draftId: evidenceDraft.id,
            draftVersion: reviewTask.draftVersion,
            draftPayload: evidenceDraft.payload,
            workflowRunId: evidenceDraft.workflowRunId,
            candidateId: candidateDocument.id,
            pmid: candidateDocument.externalId,
            title: candidateDocument.title,
            journal: candidateDocument.journal,
            publicationDate: candidateDocument.publicationDate,
            doi: candidateDocument.doi,
            documentHash: candidateDocument.documentHash,
            pmcid: candidateDocument.pmcid,
            sourceScope: candidateDocument.sourceScope,
            sourceLicense: candidateDocument.sourceLicense,
            sourceLicensePolicy: candidateDocument.sourceLicensePolicy,
            sourceUrl: candidateDocument.sourceUrl,
          })
          .from(reviewTask)
          .innerJoin(
            evidenceDraft,
            eq(reviewTask.evidenceDraftId, evidenceDraft.id)
          )
          .innerJoin(
            candidateDocument,
            eq(reviewTask.candidateDocumentId, candidateDocument.id)
          )
          .where(eq(reviewTask.id, input.reviewTaskId))
          .for('update')
          .limit(1);
        if (rows.length === 0) {
          throw new ReviewDecisionError(
            'REVIEW_TASK_NOT_FOUND',
            `Review task ${input.reviewTaskId} was not found`
          );
        }
        const row = rows[0];
        if (row.draftVersion !== input.expectedDraftVersion) {
          throw new ReviewDecisionError(
            'DRAFT_VERSION_CONFLICT',
            `Expected draft version ${input.expectedDraftVersion}, current version is ${row.draftVersion}`
          );
        }
        if (
          !['PENDING', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(row.taskStatus)
        ) {
          throw new ReviewDecisionError(
            'INVALID_REVIEW_STATE',
            `Review task ${input.reviewTaskId} is ${row.taskStatus}`
          );
        }
        const draft = parseEvidenceDraftInput(row.draftPayload);
        const releases = await transaction
          .select({
            id: knowledgeRelease.id,
            version: knowledgeRelease.version,
            literatureCutoffAt: knowledgeRelease.literatureCutoffAt,
            regulatoryCutoffAt: knowledgeRelease.regulatoryCutoffAt,
            gradingRuleVersion: knowledgeRelease.gradingRuleVersion,
          })
          .from(knowledgeRelease)
          .where(eq(knowledgeRelease.status, 'PUBLISHED'))
          .orderBy(
            desc(knowledgeRelease.publishedAt),
            desc(knowledgeRelease.id)
          )
          .for('update')
          .limit(1);
        if (releases.length === 0) {
          throw new Error('Published knowledge release is unavailable');
        }
        const currentRelease = releases[0];
        const releaseVersion = nextPatchVersion(currentRelease.version);
        const releaseId = createId();
        const decisionId = createId();
        const changeSetId = createId();
        const publishedAt = now();
        const sourceDocumentId = `doc_pubmed_${row.pmid}`;
        const contentHash = hashArtifact(draft);

        await transaction.insert(knowledgeChangeSet).values({
          id: changeSetId,
          reviewTaskId: input.reviewTaskId,
          contentHash,
          payload: draft,
          status: 'VALIDATED',
          targetVersion: releaseVersion,
        });
        await transaction.insert(sourceDocument).values({
          id: sourceDocumentId,
          sourceType: 'PUBMED',
          externalId: row.pmid,
          title: row.title,
          publisherOrAgency: null,
          journal: row.journal,
          publicationDate: row.publicationDate,
          doi: row.doi,
          pmcid: row.pmcid,
          url: row.sourceUrl,
          sourceScope: row.sourceScope,
          language: 'en',
          license:
            row.sourceLicense ??
            'PubMed abstract metadata; verify source terms',
          retrievedAt: publishedAt,
          documentHash: row.documentHash,
          metadata: {
            candidateId: row.candidateId,
            sourceLicensePolicy: row.sourceLicensePolicy,
          },
          reviewStatus: 'APPROVED',
        });
        await transaction.insert(sourcePassage).values(
          draft.passages.map((passage) => ({
            id: passage.id,
            sourceDocumentId,
            section: passage.section,
            paragraphIndex: passage.paragraphIndex,
            locator: {
              pmid: row.pmid,
              section: passage.section,
              paragraphIndex: passage.paragraphIndex,
            },
            originalText: passage.text,
            textHash: passage.textHash,
            language: 'en',
            displayPolicy: passage.displayPolicy,
            modelUsePolicy: passage.modelUsePolicy,
            publicExcerpt: ['FULL_TEXT', 'EXCERPT'].includes(
              passage.displayPolicy
            )
              ? passage.text
              : null,
            reviewStatus: 'APPROVED',
          }))
        );
        await transaction.insert(evidenceClaim).values(
          draft.claims.map((claim) => ({
            id: claim.id,
            associationId: draft.associationId,
            claimType: claim.claimType,
            evidenceMaturity: claim.evidenceMaturity,
            studyType: claim.studyType,
            studyName: claim.studyName,
            populationSummary: claim.populationSummary,
            sampleSize: claim.sampleSize,
            diseaseStage: claim.diseaseStage,
            treatmentLine: claim.treatmentLine,
            priorTherapy: claim.priorTherapy,
            intervention: claim.intervention,
            comparator: claim.comparator,
            endpoint: claim.endpoint,
            effectValue: claim.effectValue,
            conclusion: claim.conclusion,
            limitations: claim.limitations,
            cohortFingerprint: null,
            reviewStatus: 'APPROVED',
            reviewedBy: input.actorId,
            reviewedAt: publishedAt,
          }))
        );
        const passageById = new Map(
          draft.passages.map((passage) => [passage.id, passage])
        );
        await transaction.insert(evidenceClaimPassage).values(
          draft.claims.flatMap((claim) =>
            claim.passageIds.map((sourcePassageId) => ({
              evidenceClaimId: claim.id,
              sourcePassageId,
              supportRole: passageById.get(sourcePassageId)!.supportRole,
            }))
          )
        );

        const [associationRows, approvalRows, claimRows] = await Promise.all([
          transaction
            .select({
              id: knowledgeReleaseAssociation.therapeuticAssociationId,
              approvedLevel: knowledgeReleaseAssociation.approvedLevel,
              gradingRationale: knowledgeReleaseAssociation.gradingRationale,
            })
            .from(knowledgeReleaseAssociation)
            .where(
              eq(
                knowledgeReleaseAssociation.knowledgeReleaseId,
                currentRelease.id
              )
            ),
          transaction
            .select({ id: knowledgeReleaseApproval.regulatoryApprovalId })
            .from(knowledgeReleaseApproval)
            .where(
              eq(knowledgeReleaseApproval.knowledgeReleaseId, currentRelease.id)
            ),
          transaction
            .select({ id: knowledgeReleaseClaim.evidenceClaimId })
            .from(knowledgeReleaseClaim)
            .where(
              eq(knowledgeReleaseClaim.knowledgeReleaseId, currentRelease.id)
            ),
        ]);
        const publishedLevel = draft.proposedLevel as EvidenceLevel;
        const associationSnapshots: Array<{
          therapeuticAssociationId: string;
          approvedLevel: EvidenceLevel;
          gradingRationale: string;
        }> = associationRows.map(
          (association: {
            id: string;
            approvedLevel: (typeof draft)['proposedLevel'];
            gradingRationale: string;
          }) =>
            association.id === draft.associationId
              ? {
                  therapeuticAssociationId: association.id,
                  approvedLevel: publishedLevel,
                  gradingRationale: draft.gradingRationale,
                }
              : {
                  therapeuticAssociationId: association.id,
                  approvedLevel: association.approvedLevel,
                  gradingRationale: association.gradingRationale,
                }
        );
        if (
          !associationSnapshots.some(
            ({
              therapeuticAssociationId,
            }: {
              therapeuticAssociationId: string;
            }) => therapeuticAssociationId === draft.associationId
          )
        ) {
          associationSnapshots.push({
            therapeuticAssociationId: draft.associationId,
            approvedLevel: publishedLevel,
            gradingRationale: draft.gradingRationale,
          });
        }
        const claimIds = [
          ...new Set([
            ...claimRows.map(({ id }: { id: string }) => id),
            ...draft.claims.map(({ id }) => id),
          ]),
        ];
        const publicationDate = row.publicationDate
          ? new Date(`${row.publicationDate}T23:59:59.999Z`)
          : publishedAt;
        const literatureCutoffAt = new Date(
          Math.max(
            new Date(currentRelease.literatureCutoffAt).getTime(),
            publicationDate.getTime()
          )
        );

        await transaction.insert(knowledgeRelease).values({
          id: releaseId,
          version: releaseVersion,
          status: 'DRAFT',
          literatureCutoffAt,
          regulatoryCutoffAt: currentRelease.regulatoryCutoffAt,
          gradingRuleVersion: currentRelease.gradingRuleVersion,
          publishedAt: null,
          publishedBy: null,
          notes: `Published from review task ${input.reviewTaskId}; change-set-sha256:${contentHash}`,
        });
        await transaction.insert(knowledgeReleaseAssociation).values(
          associationSnapshots.map((association) => ({
            knowledgeReleaseId: releaseId,
            ...association,
          }))
        );
        if (approvalRows.length) {
          await transaction.insert(knowledgeReleaseApproval).values(
            approvalRows.map(({ id }: { id: string }) => ({
              knowledgeReleaseId: releaseId,
              regulatoryApprovalId: id,
            }))
          );
        }
        await transaction.insert(knowledgeReleaseClaim).values(
          claimIds.map((evidenceClaimId) => ({
            knowledgeReleaseId: releaseId,
            evidenceClaimId,
          }))
        );
        await transaction
          .update(knowledgeRelease)
          .set({ status: 'PUBLISHED', publishedAt, publishedBy: input.actorId })
          .where(eq(knowledgeRelease.id, releaseId));
        await transaction.insert(reviewDecision).values({
          id: decisionId,
          reviewTaskId: input.reviewTaskId,
          decision: 'APPROVE_AND_PUBLISH',
          expectedDraftVersion: input.expectedDraftVersion,
          actorId: input.actorId,
          comment: input.comment,
          requestedFields: [],
          idempotencyKey: input.idempotencyKey,
          resultReleaseId: releaseId,
        });
        await transaction
          .update(knowledgeChangeSet)
          .set({ status: 'PUBLISHED', resultReleaseId: releaseId })
          .where(eq(knowledgeChangeSet.id, changeSetId));
        await transaction
          .update(evidenceDraft)
          .set({ status: 'APPROVED' })
          .where(eq(evidenceDraft.id, row.draftId));
        await transaction
          .update(reviewTask)
          .set({
            status: 'PUBLISHED',
            publishedReleaseId: releaseId,
            lockVersion: input.expectedDraftVersion + 1,
          })
          .where(eq(reviewTask.id, input.reviewTaskId));
        await transaction
          .update(candidateDocument)
          .set({ status: 'PUBLISHED' })
          .where(eq(candidateDocument.id, row.candidateId));
        await transaction.insert(workflowStepRun).values({
          id: createId(),
          workflowRunId: row.workflowRunId,
          stepKey: 'human_review',
          attempt: 1,
          status: 'SUCCEEDED',
          inputHash: contentHash,
          outputHash: hashArtifact({
            decision: 'APPROVE_AND_PUBLISH',
            releaseId,
          }),
          startedAt: publishedAt,
          completedAt: publishedAt,
        });
        await transaction
          .update(workflowRun)
          .set({
            status: 'SUCCEEDED',
            currentStep: 'published',
            outputHash: contentHash,
            completedAt: publishedAt,
          })
          .where(eq(workflowRun.id, row.workflowRunId));

        return {
          reviewTaskId: input.reviewTaskId,
          decision: 'APPROVE_AND_PUBLISH' as const,
          status: 'PUBLISHED' as const,
          releaseId,
          releaseVersion,
          idempotent: false,
        };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        const previous = await findDecision(input.idempotencyKey);
        if (previous) return { ...previous, idempotent: true };
      }
      throw error;
    }
  }

  return {
    findDecision,
    getReviewTask,
    saveNonPublishDecision,
    publishApprovedReview,
  };
}

export function createPostgresKnowledgeCatalogRepository(
  database: Database
): KnowledgeCatalogRepository {
  async function getRelease(
    version?: string
  ): Promise<KnowledgeCatalogRelease | null> {
    const rows = await database
      .select({
        id: knowledgeRelease.id,
        version: knowledgeRelease.version,
        literatureCutoffAt: knowledgeRelease.literatureCutoffAt,
        regulatoryCutoffAt: knowledgeRelease.regulatoryCutoffAt,
        gradingRuleVersion: knowledgeRelease.gradingRuleVersion,
        publishedAt: knowledgeRelease.publishedAt,
      })
      .from(knowledgeRelease)
      .where(
        and(
          eq(knowledgeRelease.status, 'PUBLISHED'),
          ...(version ? [eq(knowledgeRelease.version, version)] : [])
        )
      )
      .orderBy(desc(knowledgeRelease.publishedAt), desc(knowledgeRelease.id))
      .limit(1);
    if (!rows.length || !rows[0].publishedAt) return null;
    return {
      id: rows[0].id,
      version: rows[0].version,
      literatureCutoffAt: iso(rows[0].literatureCutoffAt),
      regulatoryCutoffAt: iso(rows[0].regulatoryCutoffAt),
      gradingRuleVersion: rows[0].gradingRuleVersion,
      publishedAt: iso(rows[0].publishedAt),
    };
  }

  async function listRecentReleases(limit: number) {
    const rows = await database
      .select({
        id: knowledgeRelease.id,
        version: knowledgeRelease.version,
        literatureCutoffAt: knowledgeRelease.literatureCutoffAt,
        regulatoryCutoffAt: knowledgeRelease.regulatoryCutoffAt,
        gradingRuleVersion: knowledgeRelease.gradingRuleVersion,
        publishedAt: knowledgeRelease.publishedAt,
      })
      .from(knowledgeRelease)
      .where(eq(knowledgeRelease.status, 'PUBLISHED'))
      .orderBy(desc(knowledgeRelease.publishedAt), desc(knowledgeRelease.id))
      .limit(Math.max(1, Math.min(limit, 20)));
    return rows
      .filter((row: any) => row.publishedAt)
      .map((row: any) => ({
        ...row,
        literatureCutoffAt: iso(row.literatureCutoffAt),
        regulatoryCutoffAt: iso(row.regulatoryCutoffAt),
        publishedAt: iso(row.publishedAt),
      }));
  }

  async function releasedAssociationIds(releaseId: string) {
    const rows = await database
      .selectDistinct({ id: therapeuticAssociation.id })
      .from(knowledgeReleaseAssociation)
      .innerJoin(
        therapeuticAssociation,
        eq(
          knowledgeReleaseAssociation.therapeuticAssociationId,
          therapeuticAssociation.id
        )
      )
      .innerJoin(
        evidenceClaim,
        eq(evidenceClaim.associationId, therapeuticAssociation.id)
      )
      .innerJoin(
        knowledgeReleaseClaim,
        and(
          eq(knowledgeReleaseClaim.evidenceClaimId, evidenceClaim.id),
          eq(knowledgeReleaseClaim.knowledgeReleaseId, releaseId)
        )
      )
      .innerJoin(
        therapeuticAssociationDrug,
        eq(therapeuticAssociationDrug.associationId, therapeuticAssociation.id)
      )
      .innerJoin(
        regulatoryApprovalDrug,
        eq(regulatoryApprovalDrug.drugId, therapeuticAssociationDrug.drugId)
      )
      .innerJoin(
        regulatoryApproval,
        eq(regulatoryApproval.id, regulatoryApprovalDrug.regulatoryApprovalId)
      )
      .innerJoin(
        knowledgeReleaseApproval,
        and(
          eq(
            knowledgeReleaseApproval.regulatoryApprovalId,
            regulatoryApproval.id
          ),
          eq(knowledgeReleaseApproval.knowledgeReleaseId, releaseId)
        )
      )
      .where(
        and(
          eq(knowledgeReleaseAssociation.knowledgeReleaseId, releaseId),
          eq(therapeuticAssociation.reviewStatus, 'APPROVED'),
          eq(evidenceClaim.reviewStatus, 'APPROVED'),
          eq(regulatoryApproval.reviewStatus, 'APPROVED'),
          eq(regulatoryApproval.approvalStatus, 'APPROVED')
        )
      );
    return rows.map(({ id }: { id: string }) => id);
  }

  async function searchPublished(input: {
    releaseId: string;
    type?: KnowledgeEntityType;
    query: string;
    diseaseId?: string;
    geneId?: string;
    direction?: 'SENSITIVITY' | 'RESISTANCE' | 'EXPLORATORY';
    level?: string;
  }): Promise<KnowledgeCatalogItem[]> {
    let associationIds = await releasedAssociationIds(input.releaseId);
    if (
      associationIds.length &&
      (input.diseaseId || input.geneId || input.direction || input.level)
    ) {
      const filtered = await database
        .selectDistinct({ id: therapeuticAssociation.id })
        .from(knowledgeReleaseAssociation)
        .innerJoin(
          therapeuticAssociation,
          eq(
            knowledgeReleaseAssociation.therapeuticAssociationId,
            therapeuticAssociation.id
          )
        )
        .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
        .where(
          and(
            eq(knowledgeReleaseAssociation.knowledgeReleaseId, input.releaseId),
            inArray(therapeuticAssociation.id, associationIds),
            ...(input.diseaseId
              ? [eq(therapeuticAssociation.diseaseId, input.diseaseId)]
              : []),
            ...(input.geneId ? [eq(variant.geneId, input.geneId)] : []),
            ...(input.direction
              ? [eq(therapeuticAssociation.direction, input.direction)]
              : []),
            ...(input.level
              ? [
                  eq(
                    knowledgeReleaseAssociation.approvedLevel,
                    input.level as any
                  ),
                ]
              : [])
          )
        );
      associationIds = filtered.map(({ id }: { id: string }) => id);
    }
    if (!associationIds.length) return [];
    const requested: KnowledgeEntityType[] = input.type
      ? [input.type]
      : ['disease', 'gene', 'variant', 'drug'];
    const items: KnowledgeCatalogItem[] = [];

    if (requested.includes('disease')) {
      const rows = await database
        .selectDistinct({
          id: disease.id,
          canonicalName: disease.canonicalName,
          displayNameZh: disease.displayNameZh,
          displayNameEn: disease.displayNameEn,
          aliases: disease.aliases,
        })
        .from(therapeuticAssociation)
        .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
        .where(
          and(
            inArray(therapeuticAssociation.id, associationIds),
            eq(disease.status, 'ACTIVE')
          )
        );
      items.push(
        ...rows.map((row: any) =>
          normalizeItem({
            ...row,
            type: 'disease',
            aliases: asStringArray(row.aliases),
          })
        )
      );
    }
    if (requested.includes('gene') || requested.includes('variant')) {
      const rows = await database
        .selectDistinct({
          variantId: variant.id,
          geneId: gene.id,
          geneSymbol: gene.symbol,
          geneName: gene.name,
          geneAliases: gene.aliases,
          hgvsp: variant.hgvsp,
          canonicalKey: variant.canonicalKey,
          variantAliases: variant.aliases,
        })
        .from(therapeuticAssociation)
        .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
        .innerJoin(gene, eq(variant.geneId, gene.id))
        .where(
          and(
            inArray(therapeuticAssociation.id, associationIds),
            eq(variant.status, 'ACTIVE'),
            eq(gene.status, 'ACTIVE')
          )
        );
      if (requested.includes('gene')) {
        const byGene = new Map<string, KnowledgeCatalogItem>();
        for (const row of rows) {
          byGene.set(
            row.geneId,
            normalizeItem({
              id: row.geneId,
              type: 'gene',
              canonicalName: row.geneSymbol,
              displayNameZh: row.geneSymbol,
              displayNameEn: row.geneName,
              aliases: asStringArray(row.geneAliases),
            })
          );
        }
        items.push(...byGene.values());
      }
      if (requested.includes('variant')) {
        items.push(
          ...rows.map((row: any) =>
            normalizeItem({
              id: row.variantId,
              type: 'variant',
              canonicalName: `${row.geneSymbol} ${row.hgvsp ?? row.canonicalKey}`,
              displayNameZh: `${row.geneSymbol} ${row.hgvsp ?? row.canonicalKey}`,
              displayNameEn: `${row.geneSymbol} ${row.hgvsp ?? row.canonicalKey}`,
              aliases: asStringArray(row.variantAliases),
            })
          )
        );
      }
    }
    if (requested.includes('drug')) {
      const rows = await database
        .selectDistinct({
          id: drug.id,
          canonicalName: drug.genericName,
          displayNameZh: drug.displayNameZh,
          displayNameEn: drug.displayNameEn,
          aliases: drug.aliases,
          brandNames: drug.brandNames,
        })
        .from(therapeuticAssociationDrug)
        .innerJoin(drug, eq(therapeuticAssociationDrug.drugId, drug.id))
        .where(
          and(
            inArray(therapeuticAssociationDrug.associationId, associationIds),
            eq(drug.status, 'ACTIVE')
          )
        );
      items.push(
        ...rows.map((row: any) =>
          normalizeItem({
            id: row.id,
            type: 'drug',
            canonicalName: row.canonicalName,
            displayNameZh: row.displayNameZh,
            displayNameEn: row.displayNameEn,
            aliases: [
              ...asStringArray(row.aliases),
              ...asStringArray(row.brandNames),
            ],
          })
        )
      );
    }

    const needle = input.query.trim().toLocaleLowerCase('en');
    return items.filter((item) =>
      !needle
        ? true
        : [
            item.canonicalName,
            item.displayNameZh,
            item.displayNameEn,
            ...item.aliases,
          ].some((value) => value.toLocaleLowerCase('en').includes(needle))
    );
  }

  async function associationSummaries(
    releaseId: string,
    requestedIds?: string[]
  ): Promise<KnowledgeRelationSummary[]> {
    const released = await releasedAssociationIds(releaseId);
    const associationIds = requestedIds
      ? released.filter((id: string) => requestedIds.includes(id))
      : released;
    if (!associationIds.length) return [];
    const baseRows = await database
      .select({
        id: therapeuticAssociation.id,
        therapyKey: therapeuticAssociation.therapyKey,
        direction: therapeuticAssociation.direction,
        variantApplicability: therapeuticAssociation.variantApplicability,
        approvedLevel: knowledgeReleaseAssociation.approvedLevel,
        gradingRationale: knowledgeReleaseAssociation.gradingRationale,
        diseaseId: disease.id,
        diseaseCanonicalName: disease.canonicalName,
        diseaseDisplayNameZh: disease.displayNameZh,
        diseaseDisplayNameEn: disease.displayNameEn,
        geneId: gene.id,
        geneSymbol: gene.symbol,
        geneName: gene.name,
        variantId: variant.id,
        alterationType: variant.alterationType,
        hgvsp: variant.hgvsp,
        canonicalKey: variant.canonicalKey,
      })
      .from(knowledgeReleaseAssociation)
      .innerJoin(
        therapeuticAssociation,
        eq(
          knowledgeReleaseAssociation.therapeuticAssociationId,
          therapeuticAssociation.id
        )
      )
      .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .innerJoin(gene, eq(variant.geneId, gene.id))
      .where(
        and(
          eq(knowledgeReleaseAssociation.knowledgeReleaseId, releaseId),
          inArray(therapeuticAssociation.id, associationIds),
          eq(therapeuticAssociation.reviewStatus, 'APPROVED')
        )
      );
    const ids = baseRows.map((row: any) => row.id);
    if (!ids.length) return [];
    const drugRows = await database
      .select({
        associationId: therapeuticAssociationDrug.associationId,
        id: drug.id,
        genericName: drug.genericName,
        displayNameZh: drug.displayNameZh,
        displayNameEn: drug.displayNameEn,
        role: therapeuticAssociationDrug.role,
        sortOrder: therapeuticAssociationDrug.sortOrder,
      })
      .from(therapeuticAssociationDrug)
      .innerJoin(drug, eq(therapeuticAssociationDrug.drugId, drug.id))
      .where(
        and(
          inArray(therapeuticAssociationDrug.associationId, ids),
          eq(drug.status, 'ACTIVE')
        )
      );
    const claimRows = await database
      .select({
        associationId: evidenceClaim.associationId,
        id: evidenceClaim.id,
      })
      .from(knowledgeReleaseClaim)
      .innerJoin(
        evidenceClaim,
        eq(knowledgeReleaseClaim.evidenceClaimId, evidenceClaim.id)
      )
      .where(
        and(
          eq(knowledgeReleaseClaim.knowledgeReleaseId, releaseId),
          inArray(evidenceClaim.associationId, ids),
          eq(evidenceClaim.reviewStatus, 'APPROVED')
        )
      );
    const drugIds: string[] = [
      ...new Set<string>(drugRows.map((row: any) => String(row.id))),
    ];
    const approvalRows = drugIds.length
      ? await database
          .select({
            id: regulatoryApproval.id,
            drugId: regulatoryApprovalDrug.drugId,
          })
          .from(knowledgeReleaseApproval)
          .innerJoin(
            regulatoryApproval,
            eq(
              knowledgeReleaseApproval.regulatoryApprovalId,
              regulatoryApproval.id
            )
          )
          .innerJoin(
            regulatoryApprovalDrug,
            eq(
              regulatoryApproval.id,
              regulatoryApprovalDrug.regulatoryApprovalId
            )
          )
          .where(
            and(
              eq(knowledgeReleaseApproval.knowledgeReleaseId, releaseId),
              inArray(regulatoryApprovalDrug.drugId, drugIds),
              eq(regulatoryApproval.reviewStatus, 'APPROVED')
            )
          )
      : [];
    const drugsByAssociation = new Map<string, any[]>();
    for (const row of drugRows) {
      const values = drugsByAssociation.get(row.associationId) ?? [];
      values.push({
        id: row.id,
        genericName: row.genericName,
        displayNameZh: row.displayNameZh,
        displayNameEn: row.displayNameEn,
        role: row.role,
        sortOrder: row.sortOrder,
      });
      drugsByAssociation.set(row.associationId, values);
    }
    const claimsByAssociation = new Map<string, Set<string>>();
    for (const row of claimRows) {
      const values = claimsByAssociation.get(row.associationId) ?? new Set();
      values.add(row.id);
      claimsByAssociation.set(row.associationId, values);
    }
    const approvalIdsByDrug = new Map<string, Set<string>>();
    for (const row of approvalRows) {
      const values = approvalIdsByDrug.get(row.drugId) ?? new Set();
      values.add(row.id);
      approvalIdsByDrug.set(row.drugId, values);
    }
    return baseRows
      .filter((row: any) => row.approvedLevel)
      .map((row: any) => {
        const drugs = (drugsByAssociation.get(row.id) ?? []).sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.id.localeCompare(right.id, 'en')
        );
        const approvals = new Set<string>();
        for (const item of drugs) {
          for (const id of approvalIdsByDrug.get(item.id) ?? []) {
            approvals.add(id);
          }
        }
        return {
          id: row.id,
          disease: {
            id: row.diseaseId,
            canonicalName: row.diseaseCanonicalName,
            displayNameZh: row.diseaseDisplayNameZh,
            displayNameEn: row.diseaseDisplayNameEn,
          },
          gene: {
            id: row.geneId,
            symbol: row.geneSymbol,
            name: row.geneName,
          },
          variant: {
            id: row.variantId,
            alterationType: row.alterationType,
            hgvsp: row.hgvsp,
            canonicalKey: row.canonicalKey,
            applicability: row.variantApplicability,
          },
          drugs,
          therapyKey: row.therapyKey,
          direction: row.direction,
          approvedLevel: row.approvedLevel,
          gradingRationale: row.gradingRationale,
          claimCount: claimsByAssociation.get(row.id)?.size ?? 0,
          regulatoryApprovalCount: approvals.size,
        } as KnowledgeRelationSummary;
      })
      .filter(
        (association: KnowledgeRelationSummary) =>
          association.regulatoryApprovalCount > 0
      )
      .sort((left: KnowledgeRelationSummary, right: KnowledgeRelationSummary) =>
        left.id.localeCompare(right.id, 'en')
      );
  }

  function uniqueItems(items: KnowledgeEntityListItem[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()].sort(
      (left, right) =>
        left.canonicalName.localeCompare(right.canonicalName, 'en') ||
        left.id.localeCompare(right.id, 'en')
    );
  }

  async function getEntityDetail(input: {
    releaseId: string;
    type: KnowledgeEntityType;
    id: string;
  }) {
    const summaries = await associationSummaries(input.releaseId);
    const matching = summaries.filter((association) => {
      if (input.type === 'disease') return association.disease.id === input.id;
      if (input.type === 'gene') return association.gene.id === input.id;
      if (input.type === 'variant') return association.variant.id === input.id;
      return association.drugs.some((item) => item.id === input.id);
    });
    if (!matching.length) return null;
    const listItems = await searchPublished({
      releaseId: input.releaseId,
      type: input.type,
      query: '',
    });
    const item = listItems.find((candidate) => candidate.id === input.id);
    if (!item) return null;

    let extra: Record<string, unknown> = {};
    if (input.type === 'disease') {
      const rows = await database
        .select({
          lineage: disease.lineage,
          ontologySystem: disease.ontologySystem,
          ontologyCode: disease.ontologyCode,
        })
        .from(disease)
        .where(eq(disease.id, input.id))
        .limit(1);
      extra = rows[0] ?? {};
    } else if (input.type === 'gene') {
      const rows = await database
        .select({ hgncId: gene.hgncId, name: gene.name })
        .from(gene)
        .where(eq(gene.id, input.id))
        .limit(1);
      extra = rows[0] ?? {};
    } else if (input.type === 'variant') {
      const rows = await database
        .select({
          alterationType: variant.alterationType,
          hgvsp: variant.hgvsp,
          hgvsc: variant.hgvsc,
          transcript: variant.transcript,
          canonicalKey: variant.canonicalKey,
          geneId: gene.id,
          geneSymbol: gene.symbol,
        })
        .from(variant)
        .innerJoin(gene, eq(variant.geneId, gene.id))
        .where(eq(variant.id, input.id))
        .limit(1);
      extra = rows[0] ?? {};
    } else {
      const rows = await database
        .select({
          brandNames: drug.brandNames,
          externalIds: drug.externalIds,
        })
        .from(drug)
        .where(eq(drug.id, input.id))
        .limit(1);
      const approvals = await database
        .select({
          id: regulatoryApproval.id,
          authority: regulatoryApproval.authority,
          applicationNumber: regulatoryApproval.applicationNumber,
          approvalStatus: regulatoryApproval.approvalStatus,
          approvalDate: regulatoryApproval.approvalDate,
          statusAsOf: regulatoryApproval.statusAsOf,
          indicationText: regulatoryApproval.indicationText,
          biomarkerText: regulatoryApproval.biomarkerText,
          sourceId: sourceDocument.id,
        })
        .from(knowledgeReleaseApproval)
        .innerJoin(
          regulatoryApproval,
          eq(
            knowledgeReleaseApproval.regulatoryApprovalId,
            regulatoryApproval.id
          )
        )
        .innerJoin(
          regulatoryApprovalDrug,
          eq(regulatoryApproval.id, regulatoryApprovalDrug.regulatoryApprovalId)
        )
        .innerJoin(
          sourceDocument,
          eq(regulatoryApproval.sourceDocumentId, sourceDocument.id)
        )
        .where(
          and(
            eq(knowledgeReleaseApproval.knowledgeReleaseId, input.releaseId),
            eq(regulatoryApprovalDrug.drugId, input.id),
            eq(regulatoryApproval.reviewStatus, 'APPROVED'),
            eq(sourceDocument.reviewStatus, 'APPROVED')
          )
        );
      extra = {
        ...(rows[0] ?? {}),
        brandNames: asStringArray(rows[0]?.brandNames),
        regulatoryApprovals: approvals,
      };
    }

    const diseases = uniqueItems(
      matching.map((association) => ({
        id: association.disease.id,
        type: 'disease' as const,
        canonicalName: association.disease.canonicalName,
        displayNameZh: association.disease.displayNameZh,
        displayNameEn: association.disease.displayNameEn,
        aliases: [],
      }))
    );
    const genes = uniqueItems(
      matching.map((association) => ({
        id: association.gene.id,
        type: 'gene' as const,
        canonicalName: association.gene.symbol,
        displayNameZh: association.gene.symbol,
        displayNameEn: association.gene.name,
        aliases: [],
      }))
    );
    const variants = uniqueItems(
      matching.map((association) => ({
        id: association.variant.id,
        type: 'variant' as const,
        canonicalName: `${association.gene.symbol} ${association.variant.hgvsp ?? association.variant.canonicalKey}`,
        displayNameZh: `${association.gene.symbol} ${association.variant.hgvsp ?? association.variant.canonicalKey}`,
        displayNameEn: `${association.gene.symbol} ${association.variant.hgvsp ?? association.variant.canonicalKey}`,
        aliases: [],
      }))
    );
    const drugs = uniqueItems(
      matching.flatMap((association) =>
        association.drugs.map((item) => ({
          id: item.id,
          type: 'drug' as const,
          canonicalName: item.genericName,
          displayNameZh: item.displayNameZh,
          displayNameEn: item.displayNameEn,
          aliases: [],
        }))
      )
    );
    return {
      entity: { ...item, ...extra },
      associations: matching,
      related: { diseases, genes, variants, drugs },
    };
  }

  function publicPassage(row: any): PublicPassageDetail {
    const value: PublicPassageDetail = {
      id: row.id,
      section: row.section,
      paragraphIndex: row.paragraphIndex,
      locator:
        row.locator && typeof row.locator === 'object' ? row.locator : {},
      displayPolicy: row.displayPolicy,
      ...(row.supportRole ? { supportRole: row.supportRole } : {}),
    };
    if (row.displayPolicy === 'FULL_TEXT') value.text = row.originalText;
    if (row.displayPolicy === 'EXCERPT' && row.publicExcerpt) {
      value.text = row.publicExcerpt;
    }
    return value;
  }

  async function getEvidenceDetail(input: {
    releaseId: string;
    id: string;
  }): Promise<Omit<PublicEvidenceDetail, 'release'> | null> {
    const rows = await database
      .select({
        id: evidenceClaim.id,
        associationId: evidenceClaim.associationId,
        claimType: evidenceClaim.claimType,
        evidenceMaturity: evidenceClaim.evidenceMaturity,
        studyType: evidenceClaim.studyType,
        studyName: evidenceClaim.studyName,
        populationSummary: evidenceClaim.populationSummary,
        sampleSize: evidenceClaim.sampleSize,
        diseaseStage: evidenceClaim.diseaseStage,
        treatmentLine: evidenceClaim.treatmentLine,
        priorTherapy: evidenceClaim.priorTherapy,
        intervention: evidenceClaim.intervention,
        comparator: evidenceClaim.comparator,
        endpoint: evidenceClaim.endpoint,
        effectValue: evidenceClaim.effectValue,
        conclusion: evidenceClaim.conclusion,
        limitations: evidenceClaim.limitations,
      })
      .from(knowledgeReleaseClaim)
      .innerJoin(
        evidenceClaim,
        eq(knowledgeReleaseClaim.evidenceClaimId, evidenceClaim.id)
      )
      .where(
        and(
          eq(knowledgeReleaseClaim.knowledgeReleaseId, input.releaseId),
          eq(evidenceClaim.id, input.id),
          eq(evidenceClaim.reviewStatus, 'APPROVED')
        )
      )
      .limit(1);
    if (!rows.length) return null;
    const associations = await associationSummaries(input.releaseId, [
      rows[0].associationId,
    ]);
    if (!associations.length) return null;
    const passageRows = await database
      .select({
        id: sourcePassage.id,
        section: sourcePassage.section,
        paragraphIndex: sourcePassage.paragraphIndex,
        locator: sourcePassage.locator,
        originalText: sourcePassage.originalText,
        publicExcerpt: sourcePassage.publicExcerpt,
        displayPolicy: sourcePassage.displayPolicy,
        supportRole: evidenceClaimPassage.supportRole,
        sourceId: sourceDocument.id,
        sourceType: sourceDocument.sourceType,
        sourceExternalId: sourceDocument.externalId,
        sourceTitle: sourceDocument.title,
        sourceUrl: sourceDocument.url,
        sourceDoi: sourceDocument.doi,
        sourcePmcid: sourceDocument.pmcid,
      })
      .from(evidenceClaimPassage)
      .innerJoin(
        sourcePassage,
        eq(evidenceClaimPassage.sourcePassageId, sourcePassage.id)
      )
      .innerJoin(
        sourceDocument,
        eq(sourcePassage.sourceDocumentId, sourceDocument.id)
      )
      .where(
        and(
          eq(evidenceClaimPassage.evidenceClaimId, input.id),
          eq(sourcePassage.reviewStatus, 'APPROVED'),
          eq(sourceDocument.reviewStatus, 'APPROVED')
        )
      );
    const { associationId: _associationId, ...claim } = rows[0];
    return {
      claim: claim as PublicEvidenceDetail['claim'],
      association: associations[0],
      passages: passageRows.map((row: any) => ({
        ...publicPassage(row),
        source: {
          id: row.sourceId,
          sourceType: row.sourceType,
          externalId: row.sourceExternalId,
          title: row.sourceTitle,
          url: row.sourceUrl,
          doi: row.sourceDoi,
          pmcid: row.sourcePmcid,
        },
      })),
    };
  }

  async function getSourceDetail(input: {
    releaseId: string;
    id: string;
  }): Promise<Omit<PublicSourceDetail, 'release'> | null> {
    const claimRows = await database
      .selectDistinct({ id: evidenceClaim.id })
      .from(knowledgeReleaseClaim)
      .innerJoin(
        evidenceClaim,
        eq(knowledgeReleaseClaim.evidenceClaimId, evidenceClaim.id)
      )
      .innerJoin(
        evidenceClaimPassage,
        eq(evidenceClaim.id, evidenceClaimPassage.evidenceClaimId)
      )
      .innerJoin(
        sourcePassage,
        eq(evidenceClaimPassage.sourcePassageId, sourcePassage.id)
      )
      .where(
        and(
          eq(knowledgeReleaseClaim.knowledgeReleaseId, input.releaseId),
          eq(sourcePassage.sourceDocumentId, input.id),
          eq(evidenceClaim.reviewStatus, 'APPROVED'),
          eq(sourcePassage.reviewStatus, 'APPROVED')
        )
      );
    const approvalRows = await database
      .selectDistinct({ id: regulatoryApproval.id })
      .from(knowledgeReleaseApproval)
      .innerJoin(
        regulatoryApproval,
        eq(knowledgeReleaseApproval.regulatoryApprovalId, regulatoryApproval.id)
      )
      .where(
        and(
          eq(knowledgeReleaseApproval.knowledgeReleaseId, input.releaseId),
          eq(regulatoryApproval.sourceDocumentId, input.id),
          eq(regulatoryApproval.reviewStatus, 'APPROVED')
        )
      );
    if (!claimRows.length && !approvalRows.length) return null;
    const sources = await database
      .select({
        id: sourceDocument.id,
        sourceType: sourceDocument.sourceType,
        externalId: sourceDocument.externalId,
        title: sourceDocument.title,
        publisherOrAgency: sourceDocument.publisherOrAgency,
        journal: sourceDocument.journal,
        publicationDate: sourceDocument.publicationDate,
        doi: sourceDocument.doi,
        pmcid: sourceDocument.pmcid,
        url: sourceDocument.url,
        sourceScope: sourceDocument.sourceScope,
        language: sourceDocument.language,
      })
      .from(sourceDocument)
      .where(
        and(
          eq(sourceDocument.id, input.id),
          eq(sourceDocument.reviewStatus, 'APPROVED')
        )
      )
      .limit(1);
    if (!sources.length) return null;
    const passages = await database
      .select({
        id: sourcePassage.id,
        section: sourcePassage.section,
        paragraphIndex: sourcePassage.paragraphIndex,
        locator: sourcePassage.locator,
        originalText: sourcePassage.originalText,
        publicExcerpt: sourcePassage.publicExcerpt,
        displayPolicy: sourcePassage.displayPolicy,
      })
      .from(sourcePassage)
      .where(
        and(
          eq(sourcePassage.sourceDocumentId, input.id),
          eq(sourcePassage.reviewStatus, 'APPROVED')
        )
      );
    return {
      source: sources[0],
      passages: passages.map(publicPassage),
      evidenceClaimIds: claimRows.map((row: any) => row.id).sort(),
      regulatoryApprovalIds: approvalRows.map((row: any) => row.id).sort(),
    };
  }

  async function countPublished(releaseId: string) {
    const items = await searchPublished({ releaseId, query: '' });
    const associationIds = await releasedAssociationIds(releaseId);
    const claimRows = await database
      .selectDistinct({ id: evidenceClaim.id })
      .from(knowledgeReleaseClaim)
      .innerJoin(
        evidenceClaim,
        eq(knowledgeReleaseClaim.evidenceClaimId, evidenceClaim.id)
      )
      .where(
        and(
          eq(knowledgeReleaseClaim.knowledgeReleaseId, releaseId),
          eq(evidenceClaim.reviewStatus, 'APPROVED')
        )
      );
    const claimSourceRows = await database
      .selectDistinct({ id: sourceDocument.id })
      .from(knowledgeReleaseClaim)
      .innerJoin(
        evidenceClaim,
        eq(knowledgeReleaseClaim.evidenceClaimId, evidenceClaim.id)
      )
      .innerJoin(
        evidenceClaimPassage,
        eq(evidenceClaim.id, evidenceClaimPassage.evidenceClaimId)
      )
      .innerJoin(
        sourcePassage,
        eq(evidenceClaimPassage.sourcePassageId, sourcePassage.id)
      )
      .innerJoin(
        sourceDocument,
        eq(sourcePassage.sourceDocumentId, sourceDocument.id)
      )
      .where(
        and(
          eq(knowledgeReleaseClaim.knowledgeReleaseId, releaseId),
          eq(evidenceClaim.reviewStatus, 'APPROVED'),
          eq(sourcePassage.reviewStatus, 'APPROVED'),
          eq(sourceDocument.reviewStatus, 'APPROVED')
        )
      );
    const approvalSourceRows = await database
      .selectDistinct({ id: sourceDocument.id })
      .from(knowledgeReleaseApproval)
      .innerJoin(
        regulatoryApproval,
        eq(knowledgeReleaseApproval.regulatoryApprovalId, regulatoryApproval.id)
      )
      .innerJoin(
        sourceDocument,
        eq(regulatoryApproval.sourceDocumentId, sourceDocument.id)
      )
      .where(
        and(
          eq(knowledgeReleaseApproval.knowledgeReleaseId, releaseId),
          eq(regulatoryApproval.reviewStatus, 'APPROVED'),
          eq(sourceDocument.reviewStatus, 'APPROVED')
        )
      );
    const counts = (type: KnowledgeEntityType) =>
      items.filter((item) => item.type === type).length;
    return {
      diseases: counts('disease'),
      genes: counts('gene'),
      variants: counts('variant'),
      drugs: counts('drug'),
      associations: associationIds.length,
      claims: claimRows.length,
      sources: new Set([
        ...claimSourceRows.map(({ id }: { id: string }) => id),
        ...approvalSourceRows.map(({ id }: { id: string }) => id),
      ]).size,
    };
  }

  return {
    getRelease,
    countPublished,
    searchPublished,
    getEntityDetail,
    getEvidenceDetail,
    getSourceDetail,
    listRecentReleases,
  };
}

export function createPostgresQuestionRunRepository(
  database: Database
): QuestionRunRepository {
  function fromRow(row: any): QuestionRunRecord {
    return {
      id: row.id,
      questionHash: row.questionHash,
      redactedQuestion: row.redactedQuestion,
      locale: row.locale,
      context: row.context ?? undefined,
      interpretation: row.normalizedQuestion,
      status: row.status,
      knowledgeRelease: {
        id: row.knowledgeReleaseId,
        version: row.knowledgeReleaseVersion,
        literatureCutoffAt: iso(row.literatureCutoffAt),
        regulatoryCutoffAt: iso(row.regulatoryCutoffAt),
        gradingRuleVersion: row.gradingRuleVersion,
      },
      publicResult: row.publicResult ?? null,
      errorCode: row.errorCode ?? null,
      createdAt: iso(row.createdAt),
      completedAt: row.completedAt ? iso(row.completedAt) : null,
      workflowRunId: row.workflowRunId ?? null,
      currentStep: row.currentStep ?? null,
    };
  }

  function selectRun() {
    return database
      .select({
        id: questionRun.id,
        questionHash: questionRun.questionHash,
        redactedQuestion: questionRun.redactedQuestion,
        locale: questionRun.locale,
        context: questionRun.context,
        normalizedQuestion: questionRun.normalizedQuestion,
        status: questionRun.status,
        knowledgeReleaseId: questionRun.knowledgeReleaseId,
        workflowRunId: questionRun.workflowRunId,
        currentStep: workflowRun.currentStep,
        knowledgeReleaseVersion: knowledgeRelease.version,
        literatureCutoffAt: knowledgeRelease.literatureCutoffAt,
        regulatoryCutoffAt: knowledgeRelease.regulatoryCutoffAt,
        gradingRuleVersion: knowledgeRelease.gradingRuleVersion,
        publicResult: questionRun.publicResult,
        errorCode: questionRun.errorCode,
        createdAt: questionRun.createdAt,
        completedAt: questionRun.completedAt,
      })
      .from(questionRun)
      .innerJoin(
        knowledgeRelease,
        eq(questionRun.knowledgeReleaseId, knowledgeRelease.id)
      )
      .leftJoin(workflowRun, eq(questionRun.workflowRunId, workflowRun.id));
  }

  async function getPublishedRelease() {
    const rows = await database
      .select({
        id: knowledgeRelease.id,
        version: knowledgeRelease.version,
        literatureCutoffAt: knowledgeRelease.literatureCutoffAt,
        regulatoryCutoffAt: knowledgeRelease.regulatoryCutoffAt,
        gradingRuleVersion: knowledgeRelease.gradingRuleVersion,
      })
      .from(knowledgeRelease)
      .where(eq(knowledgeRelease.status, 'PUBLISHED'))
      .orderBy(desc(knowledgeRelease.publishedAt), desc(knowledgeRelease.id))
      .limit(1);
    return rows.length
      ? {
          ...rows[0],
          literatureCutoffAt: iso(rows[0].literatureCutoffAt),
          regulatoryCutoffAt: iso(rows[0].regulatoryCutoffAt),
        }
      : null;
  }

  async function findByIdempotencyKey(idempotencyKey: string) {
    const rows = await selectRun()
      .where(eq(questionRun.idempotencyKey, idempotencyKey))
      .limit(1);
    return rows.length ? fromRow(rows[0]) : null;
  }

  async function getQuestionEntityCatalog(
    releaseId: string
  ): Promise<QuestionEntityCatalog> {
    const associationRows = await database
      .select({
        diseaseCanonicalName: disease.canonicalName,
        diseaseDisplayNameZh: disease.displayNameZh,
        diseaseDisplayNameEn: disease.displayNameEn,
        diseaseAliases: disease.aliases,
        geneId: gene.id,
        geneSymbol: gene.symbol,
        geneName: gene.name,
        geneAliases: gene.aliases,
        variantGeneId: variant.geneId,
        variantAlterationType: variant.alterationType,
        variantHgvsp: variant.hgvsp,
        variantCanonicalKey: variant.canonicalKey,
        variantAliases: variant.aliases,
      })
      .from(knowledgeReleaseAssociation)
      .innerJoin(
        therapeuticAssociation,
        eq(
          knowledgeReleaseAssociation.therapeuticAssociationId,
          therapeuticAssociation.id
        )
      )
      .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .innerJoin(gene, eq(variant.geneId, gene.id))
      .where(eq(knowledgeReleaseAssociation.knowledgeReleaseId, releaseId));
    const drugRows = await database
      .select({
        genericName: drug.genericName,
        displayNameZh: drug.displayNameZh,
        displayNameEn: drug.displayNameEn,
        brandNames: drug.brandNames,
        aliases: drug.aliases,
      })
      .from(knowledgeReleaseAssociation)
      .innerJoin(
        therapeuticAssociationDrug,
        eq(
          knowledgeReleaseAssociation.therapeuticAssociationId,
          therapeuticAssociationDrug.associationId
        )
      )
      .innerJoin(drug, eq(therapeuticAssociationDrug.drugId, drug.id))
      .where(eq(knowledgeReleaseAssociation.knowledgeReleaseId, releaseId));

    const diseases: QuestionEntityCatalog['diseases'] = associationRows.map(
      (row: any) => ({
        canonicalName: row.diseaseCanonicalName,
        displayNameZh: row.diseaseDisplayNameZh,
        displayNameEn: row.diseaseDisplayNameEn,
        aliases: asStringArray(row.diseaseAliases),
      })
    );
    const genes: QuestionEntityCatalog['genes'] = associationRows.map(
      (row: any) => ({
        id: row.geneId,
        symbol: row.geneSymbol,
        name: row.geneName,
        aliases: asStringArray(row.geneAliases),
      })
    );
    const variants: QuestionEntityCatalog['variants'] = associationRows.map(
      (row: any) => ({
        geneId: row.variantGeneId,
        alterationType: row.variantAlterationType,
        hgvsp: row.variantHgvsp,
        canonicalKey: row.variantCanonicalKey,
        aliases: asStringArray(row.variantAliases),
      })
    );
    const drugs: QuestionEntityCatalog['drugs'] = drugRows.map((row: any) => ({
      genericName: row.genericName,
      displayNameZh: row.displayNameZh,
      displayNameEn: row.displayNameEn,
      brandNames: asStringArray(row.brandNames),
      aliases: asStringArray(row.aliases),
    }));
    return {
      diseases: uniqueBy(diseases, (item) => item.canonicalName),
      genes: uniqueBy(genes, (item) => item.id),
      variants: uniqueBy(variants, (item) => item.canonicalKey),
      drugs: uniqueBy(drugs, (item) => item.genericName),
    };
  }

  async function create(input: Parameters<QuestionRunRepository['create']>[0]) {
    const inserted = await database.transaction(
      async (transaction: Database) => {
        const workflowIdempotencyKey = `evidence-question:${input.idempotencyKey}`;
        const createdWorkflow = await transaction
          .insert(workflowRun)
          .values({
            id: `question-workflow:${input.id}`,
            workflowVersionId: 'evidence-question-v1',
            workflowVersion: 'evidence-question-v1',
            kind: 'DOWNSTREAM',
            idempotencyKey: workflowIdempotencyKey,
            status: 'PENDING',
            currentStep: 'understand_question',
            lockedKnowledgeReleaseId: input.knowledgeRelease.id,
            inputHash: input.questionHash,
          })
          .onConflictDoNothing({ target: workflowRun.idempotencyKey })
          .returning({ id: workflowRun.id });
        const workflowId = createdWorkflow.length
          ? createdWorkflow[0].id
          : (
              await transaction
                .select({ id: workflowRun.id })
                .from(workflowRun)
                .where(eq(workflowRun.idempotencyKey, workflowIdempotencyKey))
                .limit(1)
            )[0]?.id;
        if (!workflowId)
          throw new Error('Question workflow could not be created');
        const rows = await transaction
          .insert(questionRun)
          .values({
            id: input.id,
            questionHash: input.questionHash,
            redactedQuestion: input.redactedQuestion,
            locale: input.locale,
            context: input.context ?? {},
            normalizedQuestion: input.interpretation,
            status: input.status,
            knowledgeReleaseId: input.knowledgeRelease.id,
            workflowRunId: workflowId,
            publicResult: input.publicResult,
            errorCode: input.errorCode,
            idempotencyKey: input.idempotencyKey,
            completedAt: input.completedAt ? new Date(input.completedAt) : null,
            createdAt: new Date(input.createdAt),
          })
          .onConflictDoNothing({ target: questionRun.idempotencyKey })
          .returning({ id: questionRun.id });
        if (rows.length) {
          await transaction.insert(workflowArtifact).values({
            id: randomUUID(),
            workflowRunId: workflowId,
            artifactType: 'QuestionUnderstanding',
            schemaVersion: '1',
            createdByType: 'SKILL',
            createdById: `${input.understandingTrace.skillId}@${input.understandingTrace.skillVersion}`,
            inputArtifactIds: [],
            content: input.understandingTrace.output,
            contentHash: input.understandingTrace.outputHash,
            sensitivity: 'INTERNAL',
            publicPolicy: 'INTERNAL_ONLY',
          });
          await transaction.insert(workflowStepRun).values({
            id: randomUUID(),
            workflowRunId: workflowId,
            stepKey: input.understandingTrace.skillId,
            attempt: input.understandingTrace.attempt,
            status: 'SUCCEEDED',
            skillVersionId: `${input.understandingTrace.skillId}@${input.understandingTrace.skillVersion}`,
            agentVersionId: `${input.understandingTrace.agentId}@${input.understandingTrace.agentVersion}`,
            inputHash: input.understandingTrace.inputHash,
            outputHash: input.understandingTrace.outputHash,
            startedAt: new Date(input.createdAt),
            completedAt: new Date(
              new Date(input.createdAt).getTime() +
                input.understandingTrace.durationMs
            ),
          });
          await transaction.insert(platformJob).values({
            id: randomUUID(),
            jobType: 'QUESTION_RUN',
            resourceId: rows[0].id,
            idempotencyKey: `question-run:${rows[0].id}`,
            payload: { questionRunId: rows[0].id },
            status: 'QUEUED',
            maxAttempts: 3,
            availableAt: new Date(input.createdAt),
          });
        }
        return rows;
      }
    );
    const result = inserted.length
      ? await get(inserted[0].id)
      : await findByIdempotencyKey(input.idempotencyKey);
    if (!result) throw new Error('Question run could not be created');
    return result;
  }

  async function get(id: string) {
    const rows = await selectRun().where(eq(questionRun.id, id)).limit(1);
    return rows.length ? fromRow(rows[0]) : null;
  }

  async function markRunning(id: string, allowResume = false) {
    const updated = await database.transaction(
      async (transaction: Database) => {
        const rows = await transaction
          .update(questionRun)
          .set({ status: 'RUNNING' })
          .where(and(eq(questionRun.id, id), eq(questionRun.status, 'PENDING')))
          .returning({
            id: questionRun.id,
            workflowRunId: questionRun.workflowRunId,
          });
        if (rows[0]?.workflowRunId) {
          await transaction
            .update(workflowRun)
            .set({
              status: 'RUNNING',
              currentStep: 'normalize_query',
              startedAt: new Date(),
            })
            .where(eq(workflowRun.id, rows[0].workflowRunId));
        }
        return rows;
      }
    );
    if (updated.length) return get(id);
    if (!allowResume) return null;
    const existing = await get(id);
    return existing?.status === 'RUNNING' ? existing : null;
  }

  async function complete(
    input: Parameters<QuestionRunRepository['complete']>[0]
  ) {
    const updated = await database.transaction(
      async (transaction: Database) => {
        const rows = await transaction
          .update(questionRun)
          .set({
            status: input.status,
            publicResult: input.publicResult,
            errorCode: input.errorCode ?? null,
            completedAt: new Date(input.completedAt),
          })
          .where(eq(questionRun.id, input.id))
          .returning({
            id: questionRun.id,
            workflowRunId: questionRun.workflowRunId,
          });
        if (rows[0]?.workflowRunId) {
          const workflowStatus =
            input.status === 'FAILED'
              ? 'FAILED'
              : input.status === 'CANCELLED'
                ? 'CANCELLED'
                : input.status === 'SUMMARY_UNAVAILABLE'
                  ? 'PARTIAL_SUCCESS'
                  : 'SUCCEEDED';
          await transaction
            .update(workflowRun)
            .set({
              status: workflowStatus,
              currentStep: 'completed',
              outputHash: hashArtifact(input.publicResult),
              errorCode: input.errorCode ?? null,
              completedAt: new Date(input.completedAt),
            })
            .where(eq(workflowRun.id, rows[0].workflowRunId));
        }
        return rows;
      }
    );
    if (!updated.length) throw new Error(`Question run ${input.id} not found`);
    const result = await get(input.id);
    if (!result) throw new Error(`Question run ${input.id} not found`);
    return result;
  }

  async function recordTrace(
    input: Parameters<QuestionRunRepository['recordTrace']>[0]
  ) {
    await database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select({ workflowRunId: questionRun.workflowRunId })
        .from(questionRun)
        .where(eq(questionRun.id, input.questionRunId))
        .limit(1);
      const workflowRunId = rows[0]?.workflowRunId;
      if (!workflowRunId) throw new Error('Question workflow run not found');
      const artifactContent =
        input.trace.status === 'SUCCEEDED'
          ? input.trace.output
          : {
              errorCode: input.trace.errorCode,
              errorSummary: input.trace.errorSummary,
              attempt: input.trace.attempt,
            };
      await transaction
        .insert(workflowArtifact)
        .values({
          id: randomUUID(),
          workflowRunId,
          artifactType:
            input.trace.status === 'SUCCEEDED'
              ? `QuestionStep:${input.trace.stepKey}`
              : 'WorkflowFailure',
          schemaVersion: '1',
          createdByType: 'SKILL',
          createdById: input.trace.skillVersion,
          inputArtifactIds: [],
          content: artifactContent,
          contentHash: input.trace.outputHash ?? hashArtifact(artifactContent),
          sensitivity: 'INTERNAL',
          publicPolicy: 'INTERNAL_ONLY',
        })
        .onConflictDoNothing();
      await transaction
        .insert(workflowStepRun)
        .values({
          id: randomUUID(),
          workflowRunId,
          stepKey: input.trace.stepKey,
          attempt: input.trace.attempt,
          status: input.trace.status,
          skillVersionId: input.trace.skillVersion,
          agentVersionId: input.trace.agentVersion,
          inputHash: input.trace.inputHash,
          outputHash: input.trace.outputHash,
          errorCode: input.trace.errorCode,
          errorSummary: input.trace.errorSummary?.slice(0, 2_000),
          startedAt: new Date(Date.now() - input.trace.durationMs),
          completedAt: new Date(),
        })
        .onConflictDoNothing();
      await transaction
        .update(workflowRun)
        .set({ currentStep: input.trace.stepKey })
        .where(eq(workflowRun.id, workflowRunId));
    });
  }

  async function requeue(id: string) {
    const outcome = await database.transaction(
      async (transaction: Database) => {
        const rows = await transaction
          .select({
            id: questionRun.id,
            status: questionRun.status,
            workflowRunId: questionRun.workflowRunId,
          })
          .from(questionRun)
          .where(eq(questionRun.id, id))
          .for('update')
          .limit(1);
        if (!rows.length) return null;
        const row = rows[0];
        if (!['FAILED', 'SUMMARY_UNAVAILABLE'].includes(row.status)) {
          return { requeued: false };
        }
        await transaction
          .update(questionRun)
          .set({
            status: 'PENDING',
            publicResult: null,
            errorCode: null,
            completedAt: null,
          })
          .where(eq(questionRun.id, id));
        if (row.workflowRunId) {
          await transaction
            .update(workflowRun)
            .set({
              status: 'PENDING',
              currentStep: 'retry_requested',
              outputHash: null,
              errorCode: null,
              startedAt: null,
              completedAt: null,
            })
            .where(eq(workflowRun.id, row.workflowRunId));
        }
        const queued = await transaction
          .update(platformJob)
          .set({
            status: 'QUEUED',
            attempts: 0,
            availableAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: null,
            lastErrorSummary: null,
            completedAt: null,
          })
          .where(
            and(
              eq(platformJob.jobType, 'QUESTION_RUN'),
              eq(platformJob.resourceId, id)
            )
          )
          .returning({ id: platformJob.id });
        if (!queued.length) {
          await transaction.insert(platformJob).values({
            id: randomUUID(),
            jobType: 'QUESTION_RUN',
            resourceId: id,
            idempotencyKey: `question-run:${id}`,
            payload: { questionRunId: id },
            status: 'QUEUED',
            maxAttempts: 3,
            availableAt: new Date(),
          });
        }
        return { requeued: true };
      }
    );
    if (!outcome) return null;
    const run = await get(id);
    if (!run) return null;
    return { run, requeued: outcome.requeued };
  }

  async function createFeedback(
    input: Parameters<QuestionRunRepository['createFeedback']>[0]
  ) {
    const existing = await database
      .select({
        id: userFeedback.id,
        questionRunId: userFeedback.questionRunId,
        answerVersion: userFeedback.answerVersion,
        category: userFeedback.category,
        createdAt: userFeedback.createdAt,
        releaseVersion: knowledgeRelease.version,
      })
      .from(userFeedback)
      .innerJoin(
        knowledgeRelease,
        eq(userFeedback.knowledgeReleaseId, knowledgeRelease.id)
      )
      .where(eq(userFeedback.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing.length) {
      return {
        id: existing[0].id,
        questionRunId: existing[0].questionRunId,
        answerVersion: existing[0].answerVersion,
        knowledgeRelease: existing[0].releaseVersion,
        category: existing[0].category,
        createdAt: iso(existing[0].createdAt),
        idempotent: true,
      };
    }
    const run = await get(input.questionRunId);
    if (!run) throw new Error('Question run not found');
    const answerVersion = hashArtifact({
      status: run.status,
      result: run.publicResult,
      completedAt: run.completedAt,
    });
    try {
      await database.insert(userFeedback).values({
        id: input.id,
        questionRunId: run.id,
        answerVersion,
        knowledgeReleaseId: run.knowledgeRelease.id,
        category: input.category,
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
        createdAt: new Date(input.createdAt),
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        return createFeedback(input);
      }
      throw error;
    }
    return {
      id: input.id,
      questionRunId: run.id,
      answerVersion,
      knowledgeRelease: run.knowledgeRelease.version,
      category: input.category,
      createdAt: input.createdAt,
      idempotent: false,
    };
  }

  return {
    getPublishedRelease,
    getQuestionEntityCatalog,
    findByIdempotencyKey,
    create,
    get,
    markRunning,
    complete,
    recordTrace,
    requeue,
    createFeedback,
  };
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function traceArtifactType(skillId: string) {
  const names: Record<string, string> = {
    screen_evidence_eligibility: 'EligibilityDecision',
    extract_evidence_claims: 'ExtractedClaims',
    recognize_evidence_entities: 'RecognizedEntities',
    normalize_evidence_entities: 'NormalizedEntities',
    extract_treatment_relationship: 'RelationshipProposal',
    propose_evidence_level: 'GradingProposalTrace',
    validate_draft_completeness: 'IngestionQAReportTrace',
  };
  return names[skillId] ?? `SkillOutput:${skillId}`;
}
