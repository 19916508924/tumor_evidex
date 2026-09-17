import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  agentVersion,
  candidateDocument,
  discoveryRun,
  discoveryRunDocument,
  discoveryRunQuery,
  discoveryStrategy,
  disease,
  drug,
  evidenceClaim,
  evidenceDraft,
  gene,
  knowledgeChangeSet,
  knowledgeRelease,
  knowledgeReleaseApproval,
  knowledgeReleaseAssociation,
  knowledgeReleaseClaim,
  platformAuditEvent,
  platformJob,
  questionRun,
  reviewDecision,
  reviewTask,
  skillVersion,
  therapeuticAssociation,
  therapeuticAssociationDrug,
  userFeedback,
  variant,
  workerHeartbeat,
  workflowArtifact,
  workflowRun,
  workflowStepRun,
  workflowVersion,
} from '@/config/db/schema';
import type {
  DiscoveryCounts,
  DiscoveryRunDto,
  DiscoveryStrategyDto,
  OpsDashboardDto,
  OpsListQuery,
  PageResult,
  PublicReleaseReference,
} from '@/shared/types/evidence-platform-api';

import {
  OperationsError,
  type DefinitionKind,
  type OperationsRepository,
} from './operations';
import { hashArtifact } from './skill-runtime';
import { parseEvidenceDraftInput } from './upstream-workflow';

type Database = any;

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown) {
  return asArray(value).filter(
    (item): item is string => typeof item === 'string'
  );
}

function page<T>(items: T[], input: OpsListQuery): PageResult<T> {
  const offset = (input.page - 1) * input.pageSize;
  return {
    items: items.slice(offset, offset + input.pageSize),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / input.pageSize),
    },
  };
}

function textMatches(query: string | undefined, values: unknown[]) {
  if (!query?.trim()) return true;
  const needle = query.trim().toLocaleLowerCase('en');
  return values.some(
    (value) =>
      typeof value === 'string' &&
      value.toLocaleLowerCase('en').includes(needle)
  );
}

function inDateRange(value: Date | string, from?: string, to?: string) {
  const time = new Date(value).getTime();
  return (
    (!from || time >= new Date(from).getTime()) &&
    (!to || time <= new Date(to).getTime())
  );
}

function releaseReference(row: any): PublicReleaseReference {
  return {
    id: row.id,
    version: row.version,
    literatureCutoffAt: iso(row.literatureCutoffAt)!,
    regulatoryCutoffAt: iso(row.regulatoryCutoffAt)!,
    gradingRuleVersion: row.gradingRuleVersion,
    publishedAt: iso(row.publishedAt)!,
  };
}

function strategyDto(row: any): DiscoveryStrategyDto {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    query: row.query,
    associationId: row.associationId,
    status: row.status,
    scheduleTimezone: row.scheduleTimezone,
    scheduleRrule: row.scheduleRrule,
    overlapDays: row.overlapDays,
    maxResults: row.maxResults,
    lastSuccessfulCutoffAt: iso(row.lastSuccessfulCutoffAt),
    nextRunAt: iso(row.nextRunAt),
    updatedAt: iso(row.updatedAt)!,
  };
}

function emptyCounts(): DiscoveryCounts {
  return {
    discovered: 0,
    duplicate: 0,
    excluded: 0,
    processing: 0,
    readyForReview: 0,
    published: 0,
    failed: 0,
  };
}

function countsDto(value: unknown): DiscoveryCounts {
  const source = value && typeof value === 'object' ? (value as any) : {};
  const fallback = emptyCounts();
  return Object.fromEntries(
    Object.keys(fallback).map((key) => [
      key,
      Number.isFinite(source[key]) ? Math.max(0, Number(source[key])) : 0,
    ])
  ) as unknown as DiscoveryCounts;
}

function runDto(row: any): DiscoveryRunDto {
  return {
    id: row.id,
    strategyId: row.strategyId,
    triggerType: row.triggerType,
    triggeredBy: row.triggeredBy,
    workflowVersion: row.workflowVersion,
    scopeMode: row.scopeMode ?? 'SCOPED',
    scopeSnapshot:
      row.scopeSnapshot && typeof row.scopeSnapshot === 'object'
        ? row.scopeSnapshot
        : {},
    documentLimit:
      row.documentLimit === 50 || row.documentLimit === 100
        ? row.documentLimit
        : null,
    estimatedMatchCount: Number(row.estimatedMatchCount ?? 0),
    uniqueDiscoveredCount: Number(row.uniqueDiscoveredCount ?? 0),
    processedDocumentCount: Number(row.processedDocumentCount ?? 0),
    sourceCursor: row.sourceCursor ?? null,
    previewHash: row.previewHash ?? null,
    windowFrom: iso(row.windowFrom)!,
    windowTo: iso(row.windowTo)!,
    status: row.status,
    counts: countsDto(row.counts),
    errorCode: row.errorCode,
    errorSummary: row.errorSummary,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    pausedAt: iso(row.pausedAt),
    cancelledAt: iso(row.cancelledAt),
    createdAt: iso(row.createdAt)!,
  };
}

export function createPostgresOperationsRepository(
  database: Database,
  options: { createId?: () => string; now?: () => Date } = {}
): OperationsRepository {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  async function audit(
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, unknown> = {},
    transaction: Database = database
  ) {
    await transaction.insert(platformAuditEvent).values({
      id: createId(),
      actorId,
      action,
      resourceType,
      resourceId,
      details,
    });
  }

  async function listAssociations(input: OpsListQuery) {
    const rows = await database
      .select({
        id: therapeuticAssociation.id,
        therapyKey: therapeuticAssociation.therapyKey,
        direction: therapeuticAssociation.direction,
        variantApplicability: therapeuticAssociation.variantApplicability,
        proposedLevel: therapeuticAssociation.proposedLevel,
        approvedLevel: therapeuticAssociation.approvedLevel,
        gradingRationale: therapeuticAssociation.gradingRationale,
        reviewStatus: therapeuticAssociation.reviewStatus,
        diseaseId: disease.id,
        diseaseName: disease.canonicalName,
        diseaseDisplayNameZh: disease.displayNameZh,
        geneId: gene.id,
        geneSymbol: gene.symbol,
        variantId: variant.id,
        hgvsp: variant.hgvsp,
        canonicalKey: variant.canonicalKey,
        updatedAt: therapeuticAssociation.updatedAt,
      })
      .from(therapeuticAssociation)
      .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .innerJoin(gene, eq(variant.geneId, gene.id))
      .orderBy(
        asc(disease.canonicalName),
        asc(gene.symbol),
        asc(variant.canonicalKey)
      );
    const ids = rows.map((row: any) => row.id);
    const drugRows = ids.length
      ? await database
          .select({
            associationId: therapeuticAssociationDrug.associationId,
            id: drug.id,
            genericName: drug.genericName,
            displayNameZh: drug.displayNameZh,
            role: therapeuticAssociationDrug.role,
            sortOrder: therapeuticAssociationDrug.sortOrder,
          })
          .from(therapeuticAssociationDrug)
          .innerJoin(drug, eq(therapeuticAssociationDrug.drugId, drug.id))
          .where(inArray(therapeuticAssociationDrug.associationId, ids))
      : [];
    const drugs = new Map<string, any[]>();
    for (const item of drugRows) {
      const values = drugs.get(item.associationId) ?? [];
      values.push(item);
      drugs.set(item.associationId, values);
    }
    const items = rows
      .map((row: any) => ({
        ...row,
        updatedAt: iso(row.updatedAt),
        drugs: (drugs.get(row.id) ?? [])
          .map(({ associationId: _associationId, ...item }) => item)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      }))
      .filter(
        (row: any) =>
          (!input.status || row.reviewStatus === input.status) &&
          inDateRange(row.updatedAt, input.from, input.to) &&
          textMatches(input.q, [
            row.id,
            row.therapyKey,
            row.diseaseName,
            row.diseaseDisplayNameZh,
            row.geneSymbol,
            row.hgvsp,
            ...row.drugs.flatMap((item: any) => [
              item.genericName,
              item.displayNameZh,
            ]),
          ])
      );
    return page(items, input);
  }

  async function getWorkerHealth() {
    const [workers, jobs] = await Promise.all([
      database
        .select()
        .from(workerHeartbeat)
        .orderBy(desc(workerHeartbeat.lastSeenAt)),
      database
        .select({
          status: platformJob.status,
          availableAt: platformJob.availableAt,
          createdAt: platformJob.createdAt,
        })
        .from(platformJob)
        .where(
          inArray(platformJob.status, [
            'QUEUED',
            'RUNNING',
            'RETRY_WAIT',
            'DEAD_LETTER',
          ])
        ),
    ]);
    const checkedAt = now();
    const liveCutoff = checkedAt.getTime() - 2 * 60 * 1000;
    const liveWorkers = workers.filter(
      (worker: any) => new Date(worker.lastSeenAt).getTime() >= liveCutoff
    );
    const pending = jobs.filter((job: any) =>
      ['QUEUED', 'RETRY_WAIT'].includes(job.status)
    );
    const oldest = pending
      .map((job: any) => new Date(job.createdAt))
      .sort((left: Date, right: Date) => left.getTime() - right.getTime())[0];
    return {
      status: liveWorkers.length ? 'HEALTHY' : 'STALE',
      checkedAt: checkedAt.toISOString(),
      liveWorkerCount: liveWorkers.length,
      workers: workers.map((worker: any) => ({
        workerId: worker.workerId,
        status: worker.status,
        currentJobId: worker.currentJobId,
        startedAt: iso(worker.startedAt),
        lastSeenAt: iso(worker.lastSeenAt),
        live: new Date(worker.lastSeenAt).getTime() >= liveCutoff,
      })),
      backlog: {
        queued: jobs.filter((job: any) => job.status === 'QUEUED').length,
        running: jobs.filter((job: any) => job.status === 'RUNNING').length,
        retryWaiting: jobs.filter((job: any) => job.status === 'RETRY_WAIT')
          .length,
        deadLetter: jobs.filter((job: any) => job.status === 'DEAD_LETTER')
          .length,
        oldestPendingSince: oldest ? oldest.toISOString() : null,
      },
    };
  }

  async function listCandidates(input: OpsListQuery) {
    const rows = await database
      .select({
        id: candidateDocument.id,
        sourceType: candidateDocument.sourceType,
        externalId: candidateDocument.externalId,
        doi: candidateDocument.doi,
        title: candidateDocument.title,
        journal: candidateDocument.journal,
        publicationDate: candidateDocument.publicationDate,
        pmcid: candidateDocument.pmcid,
        sourceScope: candidateDocument.sourceScope,
        sourceLicense: candidateDocument.sourceLicense,
        sourceUrl: candidateDocument.sourceUrl,
        matchedStrategyIds: candidateDocument.matchedStrategyIds,
        status: candidateDocument.status,
        duplicateOfId: candidateDocument.duplicateOfId,
        exclusionReason: candidateDocument.exclusionReason,
        workflowRunId: candidateDocument.activeWorkflowRunId,
        workflowStatus: workflowRun.status,
        currentStep: workflowRun.currentStep,
        createdAt: candidateDocument.createdAt,
        updatedAt: candidateDocument.updatedAt,
      })
      .from(candidateDocument)
      .leftJoin(
        workflowRun,
        eq(candidateDocument.activeWorkflowRunId, workflowRun.id)
      )
      .orderBy(desc(candidateDocument.createdAt), desc(candidateDocument.id));
    const items = rows
      .map((row: any) => ({
        ...row,
        matchedStrategyIds: asStringArray(row.matchedStrategyIds),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }))
      .filter(
        (row: any) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [
            row.id,
            row.externalId,
            row.doi,
            row.title,
            row.journal,
          ])
      );
    return page(items, input);
  }

  async function getCandidate(id: string) {
    const rows = await database
      .select({
        id: candidateDocument.id,
        sourceType: candidateDocument.sourceType,
        externalId: candidateDocument.externalId,
        doi: candidateDocument.doi,
        documentHash: candidateDocument.documentHash,
        title: candidateDocument.title,
        abstract: candidateDocument.abstract,
        journal: candidateDocument.journal,
        publicationDate: candidateDocument.publicationDate,
        sourceUrl: candidateDocument.sourceUrl,
        matchedStrategyIds: candidateDocument.matchedStrategyIds,
        status: candidateDocument.status,
        duplicateOfId: candidateDocument.duplicateOfId,
        exclusionReason: candidateDocument.exclusionReason,
        workflowRunId: candidateDocument.activeWorkflowRunId,
        createdAt: candidateDocument.createdAt,
        updatedAt: candidateDocument.updatedAt,
      })
      .from(candidateDocument)
      .where(eq(candidateDocument.id, id))
      .limit(1);
    if (!rows.length) return null;
    const drafts = await database
      .select({
        id: evidenceDraft.id,
        draftVersion: evidenceDraft.draftVersion,
        status: evidenceDraft.status,
        associationId: evidenceDraft.associationId,
        payload: evidenceDraft.payload,
        fieldProvenance: evidenceDraft.fieldProvenance,
        agentVersion: evidenceDraft.agentVersion,
        skillVersions: evidenceDraft.skillVersions,
        qaIssues: evidenceDraft.qaIssues,
        parentDraftId: evidenceDraft.parentDraftId,
        editedBy: evidenceDraft.editedBy,
        editReason: evidenceDraft.editReason,
        createdAt: evidenceDraft.createdAt,
      })
      .from(evidenceDraft)
      .where(eq(evidenceDraft.candidateDocumentId, id))
      .orderBy(desc(evidenceDraft.draftVersion));
    const reviews = await database
      .select({
        id: reviewTask.id,
        status: reviewTask.status,
        draftVersion: reviewTask.draftVersion,
        assignedTo: reviewTask.assignedTo,
        publishedReleaseId: reviewTask.publishedReleaseId,
        createdAt: reviewTask.createdAt,
        updatedAt: reviewTask.updatedAt,
      })
      .from(reviewTask)
      .where(eq(reviewTask.candidateDocumentId, id))
      .orderBy(desc(reviewTask.createdAt));
    const candidate = rows[0];
    return {
      ...candidate,
      matchedStrategyIds: asStringArray(candidate.matchedStrategyIds),
      createdAt: iso(candidate.createdAt),
      updatedAt: iso(candidate.updatedAt),
      drafts: drafts.map((row: any) => ({
        ...row,
        skillVersions: asStringArray(row.skillVersions),
        qaIssues: asArray(row.qaIssues),
        createdAt: iso(row.createdAt),
      })),
      reviewTasks: reviews.map((row: any) => ({
        ...row,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      })),
      workflow: candidate.workflowRunId
        ? await getWorkflowRun(candidate.workflowRunId)
        : null,
    };
  }

  async function listReviewTasks(input: OpsListQuery) {
    const rows = await database
      .select({
        id: reviewTask.id,
        status: reviewTask.status,
        draftId: reviewTask.evidenceDraftId,
        draftVersion: reviewTask.draftVersion,
        lockVersion: reviewTask.lockVersion,
        assignedTo: reviewTask.assignedTo,
        publishedReleaseId: reviewTask.publishedReleaseId,
        candidateId: candidateDocument.id,
        title: candidateDocument.title,
        pmid: candidateDocument.externalId,
        publicationDate: candidateDocument.publicationDate,
        proposedLevel: evidenceDraft.proposedLevel,
        qaIssues: evidenceDraft.qaIssues,
        diseaseId: disease.id,
        diseaseName: disease.canonicalName,
        geneId: gene.id,
        geneSymbol: gene.symbol,
        variantId: variant.id,
        variantHgvsp: variant.hgvsp,
        createdAt: reviewTask.createdAt,
        updatedAt: reviewTask.updatedAt,
      })
      .from(reviewTask)
      .innerJoin(
        candidateDocument,
        eq(reviewTask.candidateDocumentId, candidateDocument.id)
      )
      .innerJoin(
        evidenceDraft,
        eq(reviewTask.evidenceDraftId, evidenceDraft.id)
      )
      .innerJoin(
        therapeuticAssociation,
        eq(evidenceDraft.associationId, therapeuticAssociation.id)
      )
      .innerJoin(disease, eq(therapeuticAssociation.diseaseId, disease.id))
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .innerJoin(gene, eq(variant.geneId, gene.id))
      .orderBy(desc(reviewTask.createdAt), desc(reviewTask.id));
    const items = rows
      .map((row: any) => {
        const qaIssues = asArray(row.qaIssues);
        const hasBlockingIssues = qaIssues.some(
          (issue: any) => issue?.severity === 'BLOCKING'
        );
        const risk = hasBlockingIssues
          ? 'HIGH'
          : qaIssues.some((issue: any) => issue?.severity === 'WARNING')
            ? 'MEDIUM'
            : 'LOW';
        const createdAt = iso(row.createdAt)!;
        return {
          ...row,
          qaIssues,
          hasBlockingIssues,
          risk,
          waitingHours: Math.max(
            0,
            Math.floor(
              (now().getTime() - new Date(createdAt).getTime()) / 3_600_000
            )
          ),
          waitingSince: createdAt,
          disease: { id: row.diseaseId, name: row.diseaseName },
          gene: { id: row.geneId, symbol: row.geneSymbol },
          variant: { id: row.variantId, hgvsp: row.variantHgvsp },
          createdAt,
          updatedAt: iso(row.updatedAt),
        };
      })
      .filter(
        (row: any) =>
          (!input.status || row.status === input.status) &&
          (!input.waitingAge ||
            row.waitingHours >=
              ({ '24h': 24, '72h': 72, '7d': 168 } as const)[
                input.waitingAge
              ]) &&
          (!input.diseaseId || row.diseaseId === input.diseaseId) &&
          (!input.geneId || row.geneId === input.geneId) &&
          (!input.variantId || row.variantId === input.variantId) &&
          (!input.risk || row.risk === input.risk) &&
          (input.blocking === undefined ||
            row.hasBlockingIssues === input.blocking) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [row.id, row.candidateId, row.title, row.pmid])
      );
    return page(items, input);
  }

  async function updateReviewDraft(
    input: Parameters<OperationsRepository['updateReviewDraft']>[0]
  ) {
    const draft = parseEvidenceDraftInput(input.draft);
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select({
          taskId: reviewTask.id,
          taskStatus: reviewTask.status,
          candidateId: reviewTask.candidateDocumentId,
          currentDraftId: evidenceDraft.id,
          currentVersion: evidenceDraft.draftVersion,
          workflowRunId: evidenceDraft.workflowRunId,
          associationId: evidenceDraft.associationId,
          agentVersion: evidenceDraft.agentVersion,
          skillVersions: evidenceDraft.skillVersions,
        })
        .from(reviewTask)
        .innerJoin(
          evidenceDraft,
          eq(reviewTask.evidenceDraftId, evidenceDraft.id)
        )
        .where(eq(reviewTask.id, input.reviewTaskId))
        .for('update')
        .limit(1);
      if (!rows.length) {
        throw new OperationsError('REVIEW_TASK_NOT_FOUND', 404);
      }
      const row = rows[0];
      if (row.currentVersion !== input.expectedDraftVersion) {
        throw new OperationsError('DRAFT_VERSION_CONFLICT', 409, {
          currentVersion: row.currentVersion,
        });
      }
      if (['PUBLISHED', 'REJECTED', 'PUBLISHING'].includes(row.taskStatus)) {
        throw new OperationsError('REVIEW_TASK_NOT_EDITABLE', 409);
      }
      if (draft.associationId !== row.associationId) {
        throw new OperationsError('ASSOCIATION_CHANGE_NOT_ALLOWED', 422);
      }
      const nextVersion = row.currentVersion + 1;
      const draftId = createId();
      await transaction.insert(evidenceDraft).values({
        id: draftId,
        candidateDocumentId: row.candidateId,
        workflowRunId: row.workflowRunId,
        associationId: row.associationId,
        draftVersion: nextVersion,
        status: 'READY_FOR_REVIEW',
        payload: draft,
        fieldProvenance: draft.fieldProvenance,
        agentVersion: row.agentVersion,
        skillVersions: row.skillVersions,
        proposedLevel: draft.proposedLevel,
        gradingRationale: draft.gradingRationale,
        qaIssues: draft.qaIssues,
        parentDraftId: row.currentDraftId,
        editedBy: input.actorId,
        editReason: input.reason,
      });
      await transaction
        .update(reviewTask)
        .set({
          evidenceDraftId: draftId,
          draftVersion: nextVersion,
          lockVersion: nextVersion,
          status: 'READY_FOR_REVIEW',
        })
        .where(eq(reviewTask.id, row.taskId));
      await transaction
        .update(candidateDocument)
        .set({ status: 'READY_FOR_REVIEW' })
        .where(eq(candidateDocument.id, row.candidateId));
      await audit(
        input.actorId,
        'REVIEW_DRAFT_UPDATED',
        'review_task',
        row.taskId,
        {
          previousDraftId: row.currentDraftId,
          draftId,
          previousVersion: row.currentVersion,
          draftVersion: nextVersion,
          reason: input.reason,
          contentHash: hashArtifact(draft),
        },
        transaction
      );
      return {
        reviewTaskId: row.taskId,
        draftId,
        draftVersion: nextVersion,
        status: 'READY_FOR_REVIEW',
      };
    });
  }

  async function listReleases(input: OpsListQuery) {
    const rows = await database
      .select()
      .from(knowledgeRelease)
      .orderBy(
        desc(knowledgeRelease.publishedAt),
        desc(knowledgeRelease.createdAt)
      );
    const items = rows
      .map((row: any) => ({
        ...row,
        literatureCutoffAt: iso(row.literatureCutoffAt),
        regulatoryCutoffAt: iso(row.regulatoryCutoffAt),
        publishedAt: iso(row.publishedAt),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }))
      .filter(
        (row: any) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [
            row.id,
            row.version,
            row.notes,
            row.publishedBy,
          ])
      );
    return page(items, input);
  }

  async function getRelease(id: string) {
    const rows = await database
      .select()
      .from(knowledgeRelease)
      .where(eq(knowledgeRelease.id, id))
      .limit(1);
    if (!rows.length) return null;
    const [associations, claims, approvals, changes] = await Promise.all([
      database
        .select({
          id: knowledgeReleaseAssociation.therapeuticAssociationId,
          approvedLevel: knowledgeReleaseAssociation.approvedLevel,
          gradingRationale: knowledgeReleaseAssociation.gradingRationale,
        })
        .from(knowledgeReleaseAssociation)
        .where(eq(knowledgeReleaseAssociation.knowledgeReleaseId, id)),
      database
        .select({ id: knowledgeReleaseClaim.evidenceClaimId })
        .from(knowledgeReleaseClaim)
        .where(eq(knowledgeReleaseClaim.knowledgeReleaseId, id)),
      database
        .select({ id: knowledgeReleaseApproval.regulatoryApprovalId })
        .from(knowledgeReleaseApproval)
        .where(eq(knowledgeReleaseApproval.knowledgeReleaseId, id)),
      database
        .select({
          id: knowledgeChangeSet.id,
          reviewTaskId: knowledgeChangeSet.reviewTaskId,
          contentHash: knowledgeChangeSet.contentHash,
          status: knowledgeChangeSet.status,
          targetVersion: knowledgeChangeSet.targetVersion,
          createdAt: knowledgeChangeSet.createdAt,
        })
        .from(knowledgeChangeSet)
        .where(eq(knowledgeChangeSet.resultReleaseId, id)),
    ]);
    const row = rows[0];
    return {
      ...row,
      literatureCutoffAt: iso(row.literatureCutoffAt),
      regulatoryCutoffAt: iso(row.regulatoryCutoffAt),
      publishedAt: iso(row.publishedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      members: {
        associationIds: associations.map((item: any) => item.id).sort(),
        associationSnapshots: associations
          .map((item: any) => ({
            associationId: item.id,
            approvedLevel: item.approvedLevel,
            gradingRationale: item.gradingRationale,
          }))
          .sort((left: any, right: any) =>
            left.associationId.localeCompare(right.associationId, 'en')
          ),
        claimIds: claims.map((item: any) => item.id).sort(),
        regulatoryApprovalIds: approvals.map((item: any) => item.id).sort(),
      },
      counts: {
        associations: associations.length,
        claims: claims.length,
        regulatoryApprovals: approvals.length,
      },
      changeSets: changes.map((item: any) => ({
        ...item,
        createdAt: iso(item.createdAt),
      })),
    };
  }

  async function definitionRows(kind: DefinitionKind) {
    if (kind === 'skills') {
      return database
        .select()
        .from(skillVersion)
        .orderBy(asc(skillVersion.skillId), desc(skillVersion.createdAt));
    }
    if (kind === 'agents') {
      return database
        .select()
        .from(agentVersion)
        .orderBy(asc(agentVersion.agentId), desc(agentVersion.createdAt));
    }
    return database
      .select()
      .from(workflowVersion)
      .orderBy(
        asc(workflowVersion.workflowId),
        desc(workflowVersion.createdAt)
      );
  }

  async function listDefinitions(kind: DefinitionKind, input: OpsListQuery) {
    const rows = await definitionRows(kind);
    const items = rows
      .map((row: any) => ({
        ...row,
        createdAt: iso(row.createdAt),
      }))
      .filter(
        (row: any) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [
            row.id,
            row.name,
            row.skillId,
            row.agentId,
            row.workflowId,
            row.description,
            row.goal,
          ])
      );
    return page(items, input);
  }

  function definitionConfig(kind: DefinitionKind) {
    if (kind === 'skills') {
      return {
        table: skillVersion,
        logicalColumn: skillVersion.skillId,
        logicalKey: 'skillId',
        mutable: [
          'name',
          'description',
          'inputSchema',
          'outputSchema',
          'allowedTools',
          'timeoutMs',
          'maxAttempts',
          'riskLevel',
          'evaluationSuiteId',
        ],
      } as const;
    }
    if (kind === 'agents') {
      return {
        table: agentVersion,
        logicalColumn: agentVersion.agentId,
        logicalKey: 'agentId',
        mutable: [
          'name',
          'goal',
          'instructionsVersion',
          'allowedSkillVersions',
          'allowedTools',
          'modelConfiguration',
          'tokenAndCostBudget',
          'stopConditions',
          'handoffConditions',
          'failurePolicy',
        ],
      } as const;
    }
    return {
      table: workflowVersion,
      logicalColumn: workflowVersion.workflowId,
      logicalKey: 'workflowId',
      mutable: ['name', 'definition'],
    } as const;
  }

  async function definitionVersion(
    kind: DefinitionKind,
    definitionId: string,
    versionId: string,
    transaction: Database = database,
    lock = false
  ) {
    const config = definitionConfig(kind);
    let query = transaction
      .select()
      .from(config.table)
      .where(
        and(
          eq(config.table.id, versionId),
          eq(config.logicalColumn, definitionId)
        )
      );
    if (lock) query = query.for('update');
    const rows = await query.limit(1);
    return rows[0] ?? null;
  }

  async function createDefinitionDraft(
    input: Parameters<OperationsRepository['createDefinitionDraft']>[0]
  ) {
    const config = definitionConfig(input.kind);
    const version = z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
      .parse(input.version);
    const source = await definitionVersion(
      input.kind,
      input.definitionId,
      input.sourceVersionId
    );
    if (!source) throw new OperationsError('DEFINITION_VERSION_NOT_FOUND', 404);
    const id = `${input.definitionId}@${version}`;
    const { createdAt: _createdAt, ...copied } = source as any;
    try {
      const rows = await database
        .insert(config.table)
        .values({ ...copied, id, version, status: 'DRAFT' })
        .returning();
      await audit(
        input.actorId,
        'DEFINITION_DRAFT_CREATED',
        input.kind,
        input.definitionId,
        { versionId: id, sourceVersionId: input.sourceVersionId, version }
      );
      return serializeDefinition(rows[0]);
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new OperationsError('DEFINITION_VERSION_CONFLICT', 409);
      }
      throw error;
    }
  }

  async function updateDefinitionDraft(
    input: Parameters<OperationsRepository['updateDefinitionDraft']>[0]
  ) {
    const config = definitionConfig(input.kind);
    const current = await definitionVersion(
      input.kind,
      input.definitionId,
      input.versionId
    );
    if (!current)
      throw new OperationsError('DEFINITION_VERSION_NOT_FOUND', 404);
    if (current.status !== 'DRAFT') {
      throw new OperationsError('ACTIVE_DEFINITION_IMMUTABLE', 409);
    }
    const unknown = Object.keys(input.patch).filter(
      (key) => !(config.mutable as readonly string[]).includes(key)
    );
    if (unknown.length || Object.keys(input.patch).length === 0) {
      throw new OperationsError('INVALID_DEFINITION_PATCH', 422, {
        unknownFields: unknown,
      });
    }
    validateDefinitionPatch(input.kind, input.patch);
    const rows = await database
      .update(config.table)
      .set(input.patch)
      .where(eq(config.table.id, input.versionId))
      .returning();
    await audit(
      input.actorId,
      'DEFINITION_DRAFT_UPDATED',
      input.kind,
      input.definitionId,
      { versionId: input.versionId, fields: Object.keys(input.patch).sort() }
    );
    return serializeDefinition(rows[0]);
  }

  async function evaluateDefinitionDraft(
    input: Parameters<OperationsRepository['evaluateDefinitionDraft']>[0]
  ) {
    const current = await definitionVersion(
      input.kind,
      input.definitionId,
      input.versionId
    );
    if (!current)
      throw new OperationsError('DEFINITION_VERSION_NOT_FOUND', 404);
    if (current.status !== 'DRAFT') {
      throw new OperationsError('DEFINITION_EVALUATION_REQUIRES_DRAFT', 409);
    }
    const checks = await evaluateDefinition(input.kind, current);
    const failed = checks.filter((check) => check.status === 'FAILED');
    const result = {
      versionId: input.versionId,
      suiteId:
        input.suiteId ?? current.evaluationSuiteId ?? 'schema-baseline-v1',
      status: failed.length ? ('FAILED' as const) : ('PASSED' as const),
      checks,
      evaluatedAt: now().toISOString(),
    };
    await audit(
      input.actorId,
      failed.length
        ? 'DEFINITION_EVALUATION_FAILED'
        : 'DEFINITION_EVALUATION_PASSED',
      input.kind,
      input.definitionId,
      result
    );
    if (failed.length) {
      throw new OperationsError('DEFINITION_EVALUATION_FAILED', 422, result);
    }
    return result;
  }

  async function activateDefinitionVersion(
    input: Parameters<OperationsRepository['activateDefinitionVersion']>[0]
  ) {
    const config = definitionConfig(input.kind);
    return database.transaction(async (transaction: Database) => {
      const current = await definitionVersion(
        input.kind,
        input.definitionId,
        input.versionId,
        transaction,
        true
      );
      if (!current)
        throw new OperationsError('DEFINITION_VERSION_NOT_FOUND', 404);
      if (current.status !== 'DRAFT') {
        throw new OperationsError('DEFINITION_ACTIVATION_CONFLICT', 409);
      }
      const events = await transaction
        .select({
          action: platformAuditEvent.action,
          details: platformAuditEvent.details,
        })
        .from(platformAuditEvent)
        .where(
          and(
            eq(platformAuditEvent.resourceType, input.kind),
            eq(platformAuditEvent.resourceId, input.definitionId),
            inArray(platformAuditEvent.action, [
              'DEFINITION_DRAFT_UPDATED',
              'DEFINITION_EVALUATION_PASSED',
              'DEFINITION_EVALUATION_FAILED',
            ])
          )
        )
        .orderBy(desc(platformAuditEvent.createdAt));
      const latest = events.find(
        (event: any) => event.details?.versionId === input.versionId
      );
      if (latest?.action !== 'DEFINITION_EVALUATION_PASSED') {
        throw new OperationsError('DEFINITION_EVALUATION_REQUIRED', 422);
      }
      await transaction
        .update(config.table)
        .set({ status: 'DEPRECATED' })
        .where(
          and(
            eq(config.logicalColumn, input.definitionId),
            eq(config.table.status, 'ACTIVE')
          )
        );
      const rows = await transaction
        .update(config.table)
        .set({ status: 'ACTIVE' })
        .where(eq(config.table.id, input.versionId))
        .returning();
      await audit(
        input.actorId,
        'DEFINITION_VERSION_ACTIVATED',
        input.kind,
        input.definitionId,
        { versionId: input.versionId },
        transaction
      );
      return serializeDefinition(rows[0]);
    });
  }

  async function rollbackDefinitionVersion(
    input: Parameters<OperationsRepository['rollbackDefinitionVersion']>[0]
  ) {
    const config = definitionConfig(input.kind);
    return database.transaction(async (transaction: Database) => {
      const target = await definitionVersion(
        input.kind,
        input.definitionId,
        input.versionId,
        transaction,
        true
      );
      if (!target)
        throw new OperationsError('DEFINITION_VERSION_NOT_FOUND', 404);
      if (target.status !== 'DEPRECATED') {
        throw new OperationsError('DEFINITION_ROLLBACK_CONFLICT', 409);
      }
      const active = await transaction
        .select({ id: config.table.id })
        .from(config.table)
        .where(
          and(
            eq(config.logicalColumn, input.definitionId),
            eq(config.table.status, 'ACTIVE')
          )
        )
        .for('update')
        .limit(1);
      await transaction
        .update(config.table)
        .set({ status: 'DEPRECATED' })
        .where(
          and(
            eq(config.logicalColumn, input.definitionId),
            eq(config.table.status, 'ACTIVE')
          )
        );
      const rows = await transaction
        .update(config.table)
        .set({ status: 'ACTIVE' })
        .where(eq(config.table.id, input.versionId))
        .returning();
      await audit(
        input.actorId,
        'DEFINITION_VERSION_ROLLED_BACK',
        input.kind,
        input.definitionId,
        {
          versionId: input.versionId,
          replacedVersionId: active[0]?.id ?? null,
          reason: input.reason,
        },
        transaction
      );
      return serializeDefinition(rows[0]);
    });
  }

  async function listDefinitionAudit(
    input: Parameters<OperationsRepository['listDefinitionAudit']>[0]
  ) {
    const rows = await database
      .select()
      .from(platformAuditEvent)
      .where(
        and(
          eq(platformAuditEvent.resourceType, input.kind),
          eq(platformAuditEvent.resourceId, input.definitionId)
        )
      )
      .orderBy(desc(platformAuditEvent.createdAt), desc(platformAuditEvent.id));
    return page(
      rows.map((row: any) => ({ ...row, createdAt: iso(row.createdAt) })),
      { page: input.page, pageSize: input.pageSize }
    );
  }

  async function evaluateDefinition(kind: DefinitionKind, value: any) {
    if (kind === 'skills') {
      return [
        evaluationCheck(
          'schemas_are_objects',
          isRecord(value.inputSchema) && isRecord(value.outputSchema)
        ),
        evaluationCheck(
          'runtime_limits_valid',
          Number.isInteger(value.timeoutMs) &&
            value.timeoutMs > 0 &&
            Number.isInteger(value.maxAttempts) &&
            value.maxAttempts > 0
        ),
      ];
    }
    if (kind === 'agents') {
      const allowed = asStringArray(value.allowedSkillVersions);
      const skills = allowed.length
        ? await database
            .select({ id: skillVersion.id, status: skillVersion.status })
            .from(skillVersion)
            .where(inArray(skillVersion.id, allowed))
        : [];
      return [
        evaluationCheck('has_allowed_skills', allowed.length > 0),
        evaluationCheck(
          'skills_exist_and_active',
          skills.length === allowed.length &&
            skills.every((skill: any) => skill.status === 'ACTIVE')
        ),
        evaluationCheck(
          'model_configuration_valid',
          isRecord(value.modelConfiguration)
        ),
      ];
    }
    const steps = isRecord(value.definition)
      ? (value.definition as any).steps
      : null;
    return [
      evaluationCheck(
        'workflow_has_steps',
        Array.isArray(steps) &&
          steps.length > 0 &&
          steps.every(
            (step: unknown) => typeof step === 'string' && step.trim()
          )
      ),
    ];
  }

  async function listWorkflowRuns(input: OpsListQuery) {
    const rows = await database
      .select()
      .from(workflowRun)
      .orderBy(desc(workflowRun.createdAt), desc(workflowRun.id));
    const items = rows
      .map((row: any) => ({
        ...row,
        startedAt: iso(row.startedAt),
        completedAt: iso(row.completedAt),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }))
      .filter(
        (row: any) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [
            row.id,
            row.workflowVersion,
            row.kind,
            row.currentStep,
            row.errorCode,
          ])
      );
    return page(items, input);
  }

  async function getWorkflowRun(id: string) {
    const rows = await database
      .select()
      .from(workflowRun)
      .where(eq(workflowRun.id, id))
      .limit(1);
    if (!rows.length) return null;
    const [steps, artifacts, candidates] = await Promise.all([
      database
        .select()
        .from(workflowStepRun)
        .where(eq(workflowStepRun.workflowRunId, id))
        .orderBy(asc(workflowStepRun.createdAt), asc(workflowStepRun.attempt)),
      database
        .select({
          id: workflowArtifact.id,
          artifactType: workflowArtifact.artifactType,
          schemaVersion: workflowArtifact.schemaVersion,
          createdByType: workflowArtifact.createdByType,
          createdById: workflowArtifact.createdById,
          inputArtifactIds: workflowArtifact.inputArtifactIds,
          contentHash: workflowArtifact.contentHash,
          sensitivity: workflowArtifact.sensitivity,
          publicPolicy: workflowArtifact.publicPolicy,
          createdAt: workflowArtifact.createdAt,
        })
        .from(workflowArtifact)
        .where(eq(workflowArtifact.workflowRunId, id))
        .orderBy(asc(workflowArtifact.createdAt)),
      database
        .select({
          id: candidateDocument.id,
          title: candidateDocument.title,
          externalId: candidateDocument.externalId,
          status: candidateDocument.status,
        })
        .from(candidateDocument)
        .where(eq(candidateDocument.activeWorkflowRunId, id)),
    ]);
    const row = rows[0];
    return {
      ...row,
      startedAt: iso(row.startedAt),
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      steps: steps.map((item: any) => ({
        ...item,
        startedAt: iso(item.startedAt),
        completedAt: iso(item.completedAt),
        createdAt: iso(item.createdAt),
      })),
      artifacts: artifacts.map((item: any) => ({
        ...item,
        inputArtifactIds: asStringArray(item.inputArtifactIds),
        createdAt: iso(item.createdAt),
      })),
      candidates,
    };
  }

  async function listQuestionRuns(input: OpsListQuery) {
    const rows = await database
      .select({
        id: questionRun.id,
        redactedQuestion: questionRun.redactedQuestion,
        locale: questionRun.locale,
        normalizedQuestion: questionRun.normalizedQuestion,
        status: questionRun.status,
        knowledgeReleaseId: questionRun.knowledgeReleaseId,
        workflowRunId: questionRun.workflowRunId,
        releaseVersion: knowledgeRelease.version,
        errorCode: questionRun.errorCode,
        completedAt: questionRun.completedAt,
        createdAt: questionRun.createdAt,
        updatedAt: questionRun.updatedAt,
      })
      .from(questionRun)
      .innerJoin(
        knowledgeRelease,
        eq(questionRun.knowledgeReleaseId, knowledgeRelease.id)
      )
      .orderBy(desc(questionRun.createdAt), desc(questionRun.id));
    const items = rows
      .map((row: any) => ({
        ...row,
        completedAt: iso(row.completedAt),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
      }))
      .filter(
        (row: any) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [row.id, row.redactedQuestion, row.errorCode])
      );
    return page(items, input);
  }

  async function getQuestionRun(id: string) {
    const rows = await database
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
        releaseVersion: knowledgeRelease.version,
        publicResult: questionRun.publicResult,
        errorCode: questionRun.errorCode,
        completedAt: questionRun.completedAt,
        createdAt: questionRun.createdAt,
        updatedAt: questionRun.updatedAt,
      })
      .from(questionRun)
      .innerJoin(
        knowledgeRelease,
        eq(questionRun.knowledgeReleaseId, knowledgeRelease.id)
      )
      .where(eq(questionRun.id, id))
      .limit(1);
    if (!rows.length) return null;
    const feedback = await database
      .select({
        id: userFeedback.id,
        answerVersion: userFeedback.answerVersion,
        category: userFeedback.category,
        comment: userFeedback.comment,
        createdAt: userFeedback.createdAt,
      })
      .from(userFeedback)
      .where(eq(userFeedback.questionRunId, id))
      .orderBy(desc(userFeedback.createdAt));
    const row = rows[0];
    return {
      ...row,
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      feedback: feedback.map((item: any) => ({
        ...item,
        createdAt: iso(item.createdAt),
      })),
    };
  }

  async function listDiscoveryStrategies(input: OpsListQuery) {
    const rows = await database
      .select()
      .from(discoveryStrategy)
      .orderBy(asc(discoveryStrategy.name), desc(discoveryStrategy.updatedAt));
    const items: DiscoveryStrategyDto[] = rows
      .map(strategyDto)
      .filter(
        (row: DiscoveryStrategyDto) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.updatedAt, input.from, input.to) &&
          textMatches(input.q, [row.id, row.name, row.query, row.associationId])
      );
    return page(items, input);
  }

  async function getDiscoveryStrategy(id: string) {
    const rows = await database
      .select()
      .from(discoveryStrategy)
      .where(eq(discoveryStrategy.id, id))
      .limit(1);
    return rows.length ? strategyDto(rows[0]) : null;
  }

  async function setDiscoveryStrategyStatus(
    input: Parameters<OperationsRepository['setDiscoveryStrategyStatus']>[0]
  ) {
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .update(discoveryStrategy)
        .set({ status: input.status })
        .where(eq(discoveryStrategy.id, input.id))
        .returning();
      if (!rows.length) return null;
      await audit(
        input.actorId,
        input.status === 'PAUSED'
          ? 'DISCOVERY_STRATEGY_PAUSED'
          : 'DISCOVERY_STRATEGY_RESUMED',
        'discovery_strategy',
        input.id,
        { status: input.status },
        transaction
      );
      return strategyDto(rows[0]);
    });
  }

  async function createDiscoveryRun(
    input: Parameters<OperationsRepository['createDiscoveryRun']>[0]
  ) {
    const idempotencyKey = hashArtifact({
      strategyId: input.strategyId,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
      workflowVersion: input.workflowVersion,
    });
    const existing = await database
      .select()
      .from(discoveryRun)
      .where(eq(discoveryRun.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing.length) {
      return { run: runDto(existing[0]), idempotent: true };
    }
    const id = createId();
    const values = {
      id,
      strategyId: input.strategyId,
      idempotencyKey,
      triggerType: 'MANUAL' as const,
      triggeredBy: input.actorId,
      workflowVersion: input.workflowVersion,
      windowFrom: new Date(input.windowFrom),
      windowTo: new Date(input.windowTo),
      status: 'PENDING' as const,
      counts: emptyCounts(),
    };
    try {
      return await database.transaction(async (transaction: Database) => {
        const rows = await transaction
          .insert(discoveryRun)
          .values(values)
          .returning();
        await audit(
          input.actorId,
          'DISCOVERY_RUN_TRIGGERED',
          'discovery_run',
          id,
          { strategyId: input.strategyId, idempotencyKey },
          transaction
        );
        return { run: runDto(rows[0]), idempotent: false };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        return createDiscoveryRun(input);
      }
      throw error;
    }
  }

  async function markDiscoveryRunRunning(id: string) {
    const rows = await database
      .update(discoveryRun)
      .set({ status: 'RUNNING', startedAt: now() })
      .where(and(eq(discoveryRun.id, id), eq(discoveryRun.status, 'PENDING')))
      .returning();
    return rows.length ? runDto(rows[0]) : null;
  }

  async function completeDiscoveryRun(
    input: Parameters<OperationsRepository['completeDiscoveryRun']>[0]
  ) {
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .update(discoveryRun)
        .set({
          status: input.status,
          counts: input.counts,
          errorCode: input.errorCode ?? null,
          errorSummary: input.errorSummary ?? null,
          completedAt: now(),
        })
        .where(eq(discoveryRun.id, input.id))
        .returning();
      if (!rows.length)
        throw new OperationsError('DISCOVERY_RUN_NOT_FOUND', 404);
      if (input.advanceCutoffTo) {
        await transaction
          .update(discoveryStrategy)
          .set({ lastSuccessfulCutoffAt: new Date(input.advanceCutoffTo) })
          .where(eq(discoveryStrategy.id, rows[0].strategyId));
      }
      return runDto(rows[0]);
    });
  }

  async function attachCandidateToStrategy(
    candidateId: string,
    strategyId: string
  ) {
    const rows = await database
      .select({ ids: candidateDocument.matchedStrategyIds })
      .from(candidateDocument)
      .where(eq(candidateDocument.id, candidateId))
      .limit(1);
    if (!rows.length) return;
    const ids = [...new Set([...asStringArray(rows[0].ids), strategyId])];
    await database
      .update(candidateDocument)
      .set({ matchedStrategyIds: ids })
      .where(eq(candidateDocument.id, candidateId));
  }

  async function listDiscoveryRuns(input: OpsListQuery) {
    const rows = await database
      .select()
      .from(discoveryRun)
      .orderBy(desc(discoveryRun.createdAt), desc(discoveryRun.id));
    const items: DiscoveryRunDto[] = rows
      .map(runDto)
      .filter(
        (row: DiscoveryRunDto) =>
          (!input.status || row.status === input.status) &&
          inDateRange(row.createdAt, input.from, input.to) &&
          textMatches(input.q, [row.id, row.strategyId, row.errorCode])
      );
    return page(items, input);
  }

  async function getDiscoveryRun(id: string) {
    const rows = await database
      .select()
      .from(discoveryRun)
      .where(eq(discoveryRun.id, id))
      .limit(1);
    if (!rows.length) return null;
    const strategy = await getDiscoveryStrategy(rows[0].strategyId);
    if (!strategy) return null;
    const [candidates, queries] = await Promise.all([
      database
        .select({
          id: candidateDocument.id,
          externalId: candidateDocument.externalId,
          title: candidateDocument.title,
          status: candidateDocument.status,
          matchedStrategyIds: candidateDocument.matchedStrategyIds,
          workflowRunId: candidateDocument.activeWorkflowRunId,
          createdAt: candidateDocument.createdAt,
        })
        .from(discoveryRunDocument)
        .innerJoin(
          candidateDocument,
          eq(discoveryRunDocument.candidateDocumentId, candidateDocument.id)
        )
        .where(eq(discoveryRunDocument.discoveryRunId, id))
        .orderBy(desc(candidateDocument.createdAt), desc(candidateDocument.id)),
      database
        .select({
          id: discoveryRunQuery.id,
          strategyId: discoveryRunQuery.strategyId,
          strategyVersion: discoveryRunQuery.strategyVersion,
          associationId: discoveryRunQuery.associationId,
          query: discoveryRunQuery.query,
          label: discoveryRunQuery.label,
          estimatedMatchCount: discoveryRunQuery.estimatedMatchCount,
          sourceCursor: discoveryRunQuery.sourceCursor,
          fetchedPageCount: discoveryRunQuery.fetchedPageCount,
          exhausted: discoveryRunQuery.exhausted,
          updatedAt: discoveryRunQuery.updatedAt,
        })
        .from(discoveryRunQuery)
        .where(eq(discoveryRunQuery.discoveryRunId, id))
        .orderBy(asc(discoveryRunQuery.createdAt)),
    ]);
    return {
      run: runDto(rows[0]),
      strategy,
      queries: queries.map((item: any) => ({
        ...item,
        updatedAt: iso(item.updatedAt),
      })),
      candidates: candidates.map((item: any) => ({
        ...item,
        matchedStrategyIds: asStringArray(item.matchedStrategyIds),
        createdAt: iso(item.createdAt),
      })),
    };
  }

  async function retryCandidate(
    input: Parameters<OperationsRepository['retryCandidate']>[0]
  ) {
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select({
          id: candidateDocument.id,
          status: candidateDocument.status,
          workflowRunId: candidateDocument.activeWorkflowRunId,
        })
        .from(candidateDocument)
        .where(eq(candidateDocument.id, input.id))
        .for('update')
        .limit(1);
      if (!rows.length) throw new OperationsError('CANDIDATE_NOT_FOUND', 404);
      if (!['FAILED', 'NEEDS_HUMAN'].includes(rows[0].status)) {
        throw new OperationsError('CANDIDATE_NOT_RETRYABLE', 409);
      }
      await transaction
        .update(candidateDocument)
        .set({ status: 'QUEUED' })
        .where(eq(candidateDocument.id, input.id));
      if (rows[0].workflowRunId) {
        await transaction
          .update(workflowRun)
          .set({ status: 'PENDING', currentStep: 'retry_requested' })
          .where(eq(workflowRun.id, rows[0].workflowRunId));
      }
      const draftRows = await transaction
        .select({ draftVersion: evidenceDraft.draftVersion })
        .from(evidenceDraft)
        .where(eq(evidenceDraft.candidateDocumentId, input.id))
        .orderBy(desc(evidenceDraft.draftVersion))
        .limit(1);
      const retryGeneration = (draftRows[0]?.draftVersion ?? 0) + 1;
      await transaction.insert(platformJob).values({
        id: createId(),
        jobType: 'CANDIDATE_RETRY',
        resourceId: input.id,
        idempotencyKey: `candidate-retry:${input.id}:${retryGeneration}`,
        payload: { candidateId: input.id, retryGeneration },
        status: 'QUEUED',
        maxAttempts: 3,
        availableAt: now(),
      });
      await audit(
        input.actorId,
        'CANDIDATE_RETRY_REQUESTED',
        'candidate_document',
        input.id,
        {},
        transaction
      );
      return { candidateId: input.id, status: 'QUEUED', accepted: true };
    });
  }

  async function getDashboard(range: '7d' | '30d'): Promise<OpsDashboardDto> {
    const since = new Date(
      now().getTime() - (range === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000
    );
    const [runs, workflows, reviews, releases, steps] = await Promise.all([
      database
        .select()
        .from(discoveryRun)
        .where(gte(discoveryRun.createdAt, since))
        .orderBy(desc(discoveryRun.createdAt)),
      database
        .select()
        .from(workflowRun)
        .where(gte(workflowRun.createdAt, since)),
      database
        .select({ status: reviewTask.status, createdAt: reviewTask.createdAt })
        .from(reviewTask),
      database
        .select()
        .from(knowledgeRelease)
        .where(eq(knowledgeRelease.status, 'PUBLISHED'))
        .orderBy(desc(knowledgeRelease.publishedAt))
        .limit(1),
      database
        .select({ attempt: workflowStepRun.attempt })
        .from(workflowStepRun)
        .where(gte(workflowStepRun.createdAt, since)),
    ]);
    const counts = runs.reduce((total: DiscoveryCounts, row: any) => {
      const value = countsDto(row.counts);
      for (const key of Object.keys(total) as Array<keyof DiscoveryCounts>) {
        total[key] += value[key];
      }
      return total;
    }, emptyCounts());
    const pendingReviews = reviews.filter((row: any) =>
      [
        'PENDING',
        'IN_REVIEW',
        'READY_FOR_REVIEW',
        'REQUESTED_CHANGES',
      ].includes(row.status)
    );
    const failed = workflows.filter(
      (row: any) => row.status === 'FAILED'
    ).length;
    const needsHuman = workflows.filter(
      (row: any) => row.status === 'NEEDS_HUMAN'
    ).length;
    const alerts: OpsDashboardDto['alerts'] = [];
    if (failed > 0) {
      alerts.push({
        code: 'WORKFLOW_FAILURES',
        severity: 'WARNING',
        message: `${failed} 个 Workflow 在当前时间范围内失败。`,
      });
    }
    if (pendingReviews.length > 0) {
      alerts.push({
        code: 'REVIEW_BACKLOG',
        severity: pendingReviews.length > 20 ? 'CRITICAL' : 'INFO',
        message: `${pendingReviews.length} 个审核任务等待处理。`,
      });
    }
    return {
      range,
      counts,
      backlog: {
        reviewTasks: pendingReviews.length,
        oldestWaitingSince: pendingReviews.length
          ? iso(
              pendingReviews
                .map((row: any) => new Date(row.createdAt))
                .sort(
                  (left: Date, right: Date) => left.getTime() - right.getTime()
                )[0]
            )
          : null,
      },
      workflow: {
        total: workflows.length,
        failed,
        needsHuman,
        retries: steps.filter((row: any) => row.attempt > 1).length,
        failureRate: workflows.length ? failed / workflows.length : 0,
      },
      latestDiscoveryRun: runs.length ? runDto(runs[0]) : null,
      latestRelease:
        releases.length && releases[0].publishedAt
          ? releaseReference(releases[0])
          : null,
      alerts,
    };
  }

  return {
    getDashboard,
    getWorkerHealth,
    listAssociations,
    listCandidates,
    getCandidate,
    listReviewTasks,
    updateReviewDraft,
    listReleases,
    getRelease,
    listDefinitions,
    createDefinitionDraft,
    updateDefinitionDraft,
    evaluateDefinitionDraft,
    activateDefinitionVersion,
    rollbackDefinitionVersion,
    listDefinitionAudit,
    listWorkflowRuns,
    getWorkflowRun,
    listQuestionRuns,
    getQuestionRun,
    listDiscoveryStrategies,
    getDiscoveryStrategy,
    setDiscoveryStrategyStatus,
    createDiscoveryRun,
    markDiscoveryRunRunning,
    completeDiscoveryRun,
    attachCandidateToStrategy,
    listDiscoveryRuns,
    getDiscoveryRun,
    retryCandidate,
  };
}

const definitionPatchSchemas = {
  skills: z
    .object({
      name: z.string().trim().min(1),
      description: z.string().trim().min(1),
      inputSchema: z.record(z.string(), z.unknown()),
      outputSchema: z.record(z.string(), z.unknown()),
      allowedTools: z.array(z.string().trim().min(1)),
      timeoutMs: z.number().int().positive(),
      maxAttempts: z.number().int().positive().max(10),
      riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      evaluationSuiteId: z.string().trim().min(1).nullable(),
    })
    .partial()
    .strict(),
  agents: z
    .object({
      name: z.string().trim().min(1),
      goal: z.string().trim().min(1),
      instructionsVersion: z.string().trim().min(1),
      allowedSkillVersions: z.array(z.string().trim().min(1)).min(1),
      allowedTools: z.array(z.string().trim().min(1)),
      modelConfiguration: z.record(z.string(), z.unknown()),
      tokenAndCostBudget: z.record(z.string(), z.unknown()),
      stopConditions: z.array(z.string().trim().min(1)),
      handoffConditions: z.array(z.string().trim().min(1)),
      failurePolicy: z.record(z.string(), z.unknown()),
    })
    .partial()
    .strict(),
  workflows: z
    .object({
      name: z.string().trim().min(1),
      definition: z.record(z.string(), z.unknown()),
    })
    .partial()
    .strict(),
} satisfies Record<DefinitionKind, z.ZodType>;

function validateDefinitionPatch(
  kind: DefinitionKind,
  patch: Record<string, unknown>
) {
  const result = definitionPatchSchemas[kind].safeParse(patch);
  if (!result.success) {
    throw new OperationsError('INVALID_DEFINITION_PATCH', 422, {
      issues: result.error.issues,
    });
  }
}

function serializeDefinition(value: any) {
  return { ...value, createdAt: iso(value.createdAt) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function evaluationCheck(id: string, passed: unknown) {
  return {
    id,
    status: passed ? ('PASSED' as const) : ('FAILED' as const),
  };
}
