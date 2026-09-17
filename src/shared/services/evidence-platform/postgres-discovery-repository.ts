import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, lte, or } from 'drizzle-orm';

import {
  candidateDocument,
  discoveryRun,
  discoveryRunDocument,
  discoveryRunQuery,
  discoveryStrategy,
  disease,
  gene,
  knowledgeRelease,
  platformAuditEvent,
  platformJob,
  questionRun,
  therapeuticAssociation,
  variant,
  workerHeartbeat,
  workflowRun,
} from '@/config/db/schema';

import { buildCivicPilotQuery } from './civic-source-adapter';
import {
  type DiscoveryQueryPlan,
  type DiscoveryRunRepository,
  type DiscoveryScopeInput,
  type DiscoverySource,
  type PersistentPlatformJob,
} from './discovery-run';
import { OperationsError } from './operations';

type Database = any;

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function runResult(row: any) {
  return {
    id: row.id,
    strategyId: row.strategyId,
    triggerType: row.triggerType,
    triggeredBy: row.triggeredBy,
    workflowVersion: row.workflowVersion,
    scopeMode: row.scopeMode,
    scopeSnapshot: asRecord(row.scopeSnapshot),
    documentLimit: row.documentLimit,
    estimatedMatchCount: row.estimatedMatchCount,
    uniqueDiscoveredCount: row.uniqueDiscoveredCount,
    processedDocumentCount: row.processedDocumentCount,
    sourceCursor: row.sourceCursor,
    previewHash: row.previewHash,
    windowFrom: iso(row.windowFrom),
    windowTo: iso(row.windowTo),
    status: row.status,
    counts: asRecord(row.counts),
    errorCode: row.errorCode,
    errorSummary: row.errorSummary,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    pausedAt: iso(row.pausedAt),
    cancelledAt: iso(row.cancelledAt),
    createdAt: iso(row.createdAt),
  };
}

export function createPostgresDiscoveryRunRepository(
  database: Database,
  options: { createId?: () => string; now?: () => Date } = {}
): DiscoveryRunRepository {
  const createId = options.createId ?? randomUUID;
  const now = options.now ?? (() => new Date());

  async function audit(
    actorId: string,
    action: string,
    resourceId: string,
    details: Record<string, unknown>,
    connection: Database = database
  ) {
    await connection.insert(platformAuditEvent).values({
      id: createId(),
      actorId,
      action,
      resourceType: 'discovery_run',
      resourceId,
      details,
    });
  }

  async function resolveDiscoveryScope(
    scope: DiscoveryScopeInput,
    source: DiscoverySource = 'PUBMED'
  ) {
    const releases = await database
      .select({
        id: knowledgeRelease.id,
        version: knowledgeRelease.version,
      })
      .from(knowledgeRelease)
      .where(eq(knowledgeRelease.status, 'PUBLISHED'))
      .orderBy(desc(knowledgeRelease.publishedAt), desc(knowledgeRelease.id))
      .limit(1);
    if (!releases.length) {
      throw new OperationsError('PUBLISHED_RELEASE_NOT_FOUND', 409);
    }
    const rows = await database
      .select({
        strategyId: discoveryStrategy.id,
        strategyVersion: discoveryStrategy.version,
        associationId: discoveryStrategy.associationId,
        query: discoveryStrategy.query,
        label: discoveryStrategy.name,
        overlapDays: discoveryStrategy.overlapDays,
        lastSuccessfulCutoffAt: discoveryStrategy.lastSuccessfulCutoffAt,
        diseaseId: therapeuticAssociation.diseaseId,
        geneId: variant.geneId,
        variantId: therapeuticAssociation.variantId,
      })
      .from(discoveryStrategy)
      .innerJoin(
        therapeuticAssociation,
        eq(discoveryStrategy.associationId, therapeuticAssociation.id)
      )
      .innerJoin(variant, eq(therapeuticAssociation.variantId, variant.id))
      .where(eq(discoveryStrategy.status, 'ACTIVE'))
      .orderBy(asc(discoveryStrategy.id));

    const requested =
      scope.mode === 'SCOPED'
        ? {
            diseaseIds: new Set(scope.diseaseIds),
            geneIds: new Set(scope.geneIds),
            variantIds: new Set(scope.variantIds),
          }
        : null;
    if (requested) {
      await assertKnownIds(database, requested);
    }
    const matched = rows.filter(
      (row: any) =>
        !requested ||
        ((requested.diseaseIds.size === 0 ||
          requested.diseaseIds.has(row.diseaseId)) &&
          (requested.geneIds.size === 0 || requested.geneIds.has(row.geneId)) &&
          (requested.variantIds.size === 0 ||
            requested.variantIds.has(row.variantId)))
    );
    const queries: DiscoveryQueryPlan[] = matched.flatMap((row: any) => {
      const query =
        source === 'CIVIC'
          ? buildCivicPilotQuery({
              diseaseId: row.diseaseId,
              variantId: row.variantId,
            })
          : row.query;
      return query
        ? [
            {
              strategyId: row.strategyId,
              strategyVersion:
                source === 'CIVIC'
                  ? `${row.strategyVersion}+civic-pilot.1`
                  : row.strategyVersion,
              associationId: row.associationId,
              query,
              label: source === 'CIVIC' ? `CIViC · ${row.label}` : row.label,
            },
          ]
        : [];
    });
    const snapshotRows = scope.mode === 'ALL_KNOWLEDGE' ? matched : [];
    const ids =
      scope.mode === 'SCOPED'
        ? scope
        : {
            diseaseIds: snapshotRows.map((row: any) => row.diseaseId),
            geneIds: snapshotRows.map((row: any) => row.geneId),
            variantIds: snapshotRows.map((row: any) => row.variantId),
          };
    const cutoffs = matched
      .map((row: any) => row.lastSuccessfulCutoffAt)
      .filter(Boolean)
      .map((value: Date | string) => new Date(value).getTime());
    return {
      snapshot: {
        source,
        mode: scope.mode,
        diseaseIds: unique(ids.diseaseIds),
        geneIds: unique(ids.geneIds),
        variantIds: unique(ids.variantIds),
        aliasVersion: 'catalog-v1',
        knowledgeReleaseId: releases[0].id,
        knowledgeReleaseVersion: releases[0].version,
      },
      queries,
      lastSuccessfulCutoffAt:
        source === 'PUBMED' &&
        cutoffs.length === matched.length &&
        cutoffs.length
          ? new Date(Math.min(...cutoffs)).toISOString()
          : null,
      overlapDays: matched.reduce(
        (maximum: number, row: any) => Math.max(maximum, row.overlapDays),
        0
      ),
    };
  }

  async function createManualDiscoveryRun(
    input: Parameters<DiscoveryRunRepository['createManualDiscoveryRun']>[0]
  ) {
    const existing = await database
      .select()
      .from(discoveryRun)
      .where(eq(discoveryRun.idempotencyKey, input.preview.previewHash))
      .limit(1);
    if (existing.length) {
      return { run: runResult(existing[0]), idempotent: true };
    }
    const first = input.preview.queries[0];
    if (!first) throw new OperationsError('DISCOVERY_SCOPE_CONFLICT', 422);
    const runId = createId();
    const jobId = createId();
    try {
      return await database.transaction(async (transaction: Database) => {
        const rows = await transaction
          .insert(discoveryRun)
          .values({
            id: runId,
            strategyId: first.strategyId,
            idempotencyKey: input.preview.previewHash,
            triggerType: 'MANUAL',
            triggeredBy: input.actorId,
            workflowVersion: input.workflowVersion,
            scopeMode: input.preview.snapshot.mode,
            scopeSnapshot: input.preview.snapshot,
            documentLimit:
              input.preview.documentLimit === 'ALL'
                ? null
                : input.preview.documentLimit,
            estimatedMatchCount: input.preview.estimatedMatchCount,
            previewHash: input.preview.previewHash,
            windowFrom: new Date(input.preview.window.from),
            windowTo: new Date(input.preview.window.to),
            status: 'PENDING',
          })
          .returning();
        await transaction.insert(discoveryRunQuery).values(
          input.preview.queries.map((query) => ({
            id: createId(),
            discoveryRunId: runId,
            strategyId: query.strategyId,
            strategyVersion: query.strategyVersion,
            associationId: query.associationId,
            query: query.query,
            label: query.label,
            estimatedMatchCount: query.estimatedMatchCount ?? 0,
          }))
        );
        await transaction.insert(platformJob).values({
          id: jobId,
          jobType: 'DISCOVERY_RUN',
          resourceId: runId,
          idempotencyKey: `discovery-run:${runId}`,
          payload: { runId },
          status: 'QUEUED',
          maxAttempts: 5,
          availableAt: now(),
        });
        await audit(
          input.actorId,
          'DISCOVERY_RUN_CREATED',
          runId,
          {
            previewHash: input.preview.previewHash,
            clientIdempotencyKey: input.idempotencyKey,
            scope: input.preview.snapshot,
            documentLimit: input.preview.documentLimit,
            jobId,
          },
          transaction
        );
        return { run: runResult(rows[0]), idempotent: false };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        return createManualDiscoveryRun(input);
      }
      throw error;
    }
  }

  async function transitionDiscoveryRun(
    input: Parameters<DiscoveryRunRepository['transitionDiscoveryRun']>[0]
  ) {
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select()
        .from(discoveryRun)
        .where(eq(discoveryRun.id, input.runId))
        .for('update')
        .limit(1);
      if (!rows.length)
        throw new OperationsError('DISCOVERY_RUN_NOT_FOUND', 404);
      const current = rows[0];
      const terminal = [
        'SUCCEEDED',
        'PARTIAL_SUCCESS',
        'FAILED',
        'CANCELLED',
      ].includes(current.status);
      if (terminal) {
        throw new OperationsError('DISCOVERY_RUN_NOT_CONTROLLABLE', 409, {
          status: current.status,
        });
      }
      if (input.action === 'pause' && current.status === 'PAUSED') {
        return runResult(current);
      }
      if (input.action === 'resume' && current.status !== 'PAUSED') {
        throw new OperationsError('DISCOVERY_RUN_NOT_PAUSED', 409);
      }
      const timestamp = now();
      const nextStatus =
        input.action === 'pause'
          ? 'PAUSED'
          : input.action === 'cancel'
            ? 'CANCELLED'
            : 'PENDING';
      const updated = await transaction
        .update(discoveryRun)
        .set({
          status: nextStatus,
          pausedAt: input.action === 'pause' ? timestamp : null,
          cancelledAt: input.action === 'cancel' ? timestamp : null,
          completedAt: input.action === 'cancel' ? timestamp : null,
        })
        .where(eq(discoveryRun.id, input.runId))
        .returning();
      if (input.action === 'pause') {
        await transaction
          .update(platformJob)
          .set({ status: 'PAUSED', lockedAt: null, lockedBy: null })
          .where(
            and(
              eq(platformJob.jobType, 'DISCOVERY_RUN'),
              eq(platformJob.resourceId, input.runId),
              inArray(platformJob.status, ['QUEUED', 'RUNNING', 'RETRY_WAIT'])
            )
          );
      } else if (input.action === 'resume') {
        await transaction
          .update(platformJob)
          .set({ status: 'QUEUED', availableAt: timestamp })
          .where(
            and(
              eq(platformJob.jobType, 'DISCOVERY_RUN'),
              eq(platformJob.resourceId, input.runId),
              eq(platformJob.status, 'PAUSED')
            )
          );
      } else {
        await transaction
          .update(platformJob)
          .set({ status: 'CANCELLED', completedAt: timestamp })
          .where(
            and(
              eq(platformJob.jobType, 'DISCOVERY_RUN'),
              eq(platformJob.resourceId, input.runId),
              inArray(platformJob.status, [
                'QUEUED',
                'RUNNING',
                'RETRY_WAIT',
                'PAUSED',
              ])
            )
          );
      }
      await audit(
        input.actorId,
        `DISCOVERY_RUN_${input.action.toUpperCase()}`,
        input.runId,
        { previousStatus: current.status, status: nextStatus },
        transaction
      );
      return runResult(updated[0]);
    });
  }

  async function claimPlatformJob(input: {
    workerId: string;
    lockTimeoutMs: number;
  }): Promise<PersistentPlatformJob | null> {
    return database.transaction(async (transaction: Database) => {
      const timestamp = now();
      const staleAt = new Date(timestamp.getTime() - input.lockTimeoutMs);
      const rows = await transaction
        .select()
        .from(platformJob)
        .where(
          or(
            and(
              inArray(platformJob.status, ['QUEUED', 'RETRY_WAIT']),
              lte(platformJob.availableAt, timestamp)
            ),
            and(
              eq(platformJob.status, 'RUNNING'),
              lte(platformJob.lockedAt, staleAt)
            )
          )
        )
        .orderBy(asc(platformJob.availableAt), asc(platformJob.createdAt))
        .for('update', { skipLocked: true })
        .limit(1);
      if (!rows.length) return null;
      const row = rows[0];
      const updated = await transaction
        .update(platformJob)
        .set({
          status: 'RUNNING',
          attempts: row.attempts + 1,
          lockedAt: timestamp,
          lockedBy: input.workerId,
        })
        .where(eq(platformJob.id, row.id))
        .returning();
      return jobResult(updated[0]);
    });
  }

  async function completePlatformJob(jobId: string) {
    await database
      .update(platformJob)
      .set({
        status: 'SUCCEEDED',
        completedAt: now(),
        lockedAt: null,
        lockedBy: null,
      })
      .where(and(eq(platformJob.id, jobId), eq(platformJob.status, 'RUNNING')));
  }

  async function failPlatformJob(input: {
    jobId: string;
    errorCode: string;
    errorSummary: string;
  }) {
    return database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select()
        .from(platformJob)
        .where(eq(platformJob.id, input.jobId))
        .for('update')
        .limit(1);
      if (!rows.length)
        throw new OperationsError('PLATFORM_JOB_NOT_FOUND', 404);
      const row = rows[0];
      const dead = row.attempts >= row.maxAttempts;
      const delayMs = Math.min(
        60_000,
        1_000 * 2 ** Math.max(0, row.attempts - 1)
      );
      const status = dead ? 'DEAD_LETTER' : 'RETRY_WAIT';
      await transaction
        .update(platformJob)
        .set({
          status,
          availableAt: dead
            ? row.availableAt
            : new Date(now().getTime() + delayMs),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: input.errorCode,
          lastErrorSummary: input.errorSummary.slice(0, 2_000),
          completedAt: dead ? now() : null,
        })
        .where(eq(platformJob.id, input.jobId));
      if (dead && row.jobType === 'DISCOVERY_RUN') {
        await transaction
          .update(discoveryRun)
          .set({
            status: 'FAILED',
            errorCode: input.errorCode,
            errorSummary: input.errorSummary.slice(0, 2_000),
            completedAt: now(),
          })
          .where(
            and(
              eq(discoveryRun.id, row.resourceId),
              inArray(discoveryRun.status, ['PENDING', 'RUNNING'])
            )
          );
      }
      if (dead && row.jobType === 'CANDIDATE_RETRY') {
        const candidates = await transaction
          .update(candidateDocument)
          .set({ status: 'FAILED' })
          .where(eq(candidateDocument.id, row.resourceId))
          .returning({ workflowRunId: candidateDocument.activeWorkflowRunId });
        const workflowRunId = candidates[0]?.workflowRunId;
        if (workflowRunId) {
          await transaction
            .update(workflowRun)
            .set({
              status: 'FAILED',
              currentStep: 'candidate_retry',
              errorCode: input.errorCode,
              completedAt: now(),
            })
            .where(eq(workflowRun.id, workflowRunId));
        }
      }
      if (dead && row.jobType === 'QUESTION_RUN') {
        const questions = await transaction
          .update(questionRun)
          .set({
            status: 'FAILED',
            errorCode: input.errorCode,
            publicResult: {
              status: 'FAILED',
              message: 'EVIDENCE_WORKFLOW_UNAVAILABLE',
            },
            completedAt: now(),
          })
          .where(
            and(
              eq(questionRun.id, row.resourceId),
              inArray(questionRun.status, ['PENDING', 'RUNNING'])
            )
          )
          .returning({ workflowRunId: questionRun.workflowRunId });
        const workflowRunId = questions[0]?.workflowRunId;
        if (workflowRunId) {
          await transaction
            .update(workflowRun)
            .set({
              status: 'FAILED',
              currentStep: 'question_run',
              errorCode: input.errorCode,
              completedAt: now(),
            })
            .where(eq(workflowRun.id, workflowRunId));
        }
      }
      return { status } as { status: 'RETRY_WAIT' | 'DEAD_LETTER' };
    });
  }

  async function beginDiscoveryRun(runId: string) {
    const run = await database.transaction(async (transaction: Database) => {
      const rows = await transaction
        .select()
        .from(discoveryRun)
        .where(eq(discoveryRun.id, runId))
        .for('update')
        .limit(1);
      if (!rows.length) return null;
      const row = rows[0];
      if (!['PENDING', 'RUNNING'].includes(row.status)) return null;
      if (row.status === 'RUNNING') return row;
      const updated = await transaction
        .update(discoveryRun)
        .set({ status: 'RUNNING', startedAt: row.startedAt ?? now() })
        .where(eq(discoveryRun.id, runId))
        .returning();
      return updated[0];
    });
    if (!run) return null;
    const queries = await database
      .select()
      .from(discoveryRunQuery)
      .where(eq(discoveryRunQuery.discoveryRunId, runId))
      .orderBy(asc(discoveryRunQuery.createdAt), asc(discoveryRunQuery.id));
    return {
      run: {
        id: run.id,
        source:
          asRecord(run.scopeSnapshot).source === 'CIVIC'
            ? ('CIVIC' as const)
            : ('PUBMED' as const),
        status: 'RUNNING' as const,
        windowFrom: iso(run.windowFrom)!,
        windowTo: iso(run.windowTo)!,
        documentLimit:
          run.documentLimit === 50 || run.documentLimit === 100
            ? run.documentLimit
            : null,
        uniqueDiscoveredCount: Number(run.uniqueDiscoveredCount ?? 0),
        processedDocumentCount: Number(run.processedDocumentCount ?? 0),
        counts: discoveryCounts(run.counts),
      },
      queries: queries.map((query: any) => ({
        id: query.id,
        strategyId: query.strategyId,
        strategyVersion: query.strategyVersion,
        associationId: query.associationId,
        query: query.query,
        label: query.label,
        estimatedMatchCount: query.estimatedMatchCount,
        sourceCursor: query.sourceCursor,
        exhausted: query.exhausted,
      })),
    };
  }

  async function getDiscoveryRunStatus(runId: string) {
    const rows = await database
      .select({ status: discoveryRun.status })
      .from(discoveryRun)
      .where(eq(discoveryRun.id, runId))
      .limit(1);
    return rows[0]?.status ?? null;
  }

  async function claimDiscoveryDocument(input: {
    runId: string;
    externalId: string;
    strategyId: string;
  }) {
    return database.transaction(async (transaction: Database) => {
      const runRows = await transaction
        .select()
        .from(discoveryRun)
        .where(eq(discoveryRun.id, input.runId))
        .for('update')
        .limit(1);
      if (!runRows.length)
        throw new OperationsError('DISCOVERY_RUN_NOT_FOUND', 404);
      const run = runRows[0];
      if (run.status !== 'RUNNING') {
        return {
          shouldProcess: false,
          limitReached: true,
          uniqueDiscoveredCount: Number(run.uniqueDiscoveredCount ?? 0),
        };
      }
      const existing = await transaction
        .select()
        .from(discoveryRunDocument)
        .where(
          and(
            eq(discoveryRunDocument.discoveryRunId, input.runId),
            eq(discoveryRunDocument.externalId, input.externalId)
          )
        )
        .for('update')
        .limit(1);
      if (existing.length) {
        const strategyIds = unique([
          ...asStringArray(existing[0].matchedStrategyIds),
          input.strategyId,
        ]);
        await transaction
          .update(discoveryRunDocument)
          .set({ matchedStrategyIds: strategyIds })
          .where(eq(discoveryRunDocument.id, existing[0].id));
        return {
          shouldProcess: existing[0].status === 'DISCOVERED',
          limitReached: false,
          uniqueDiscoveredCount: Number(run.uniqueDiscoveredCount ?? 0),
        };
      }
      const discovered = Number(run.uniqueDiscoveredCount ?? 0);
      if (run.documentLimit !== null && discovered >= run.documentLimit) {
        return {
          shouldProcess: false,
          limitReached: true,
          uniqueDiscoveredCount: discovered,
        };
      }
      const nextDiscovered = discovered + 1;
      await transaction.insert(discoveryRunDocument).values({
        id: createId(),
        discoveryRunId: input.runId,
        externalId: input.externalId,
        matchedStrategyIds: [input.strategyId],
        status: 'DISCOVERED',
      });
      const counts = discoveryCounts(run.counts);
      counts.discovered = nextDiscovered;
      await transaction
        .update(discoveryRun)
        .set({ uniqueDiscoveredCount: nextDiscovered, counts })
        .where(eq(discoveryRun.id, input.runId));
      return {
        shouldProcess: true,
        limitReached: false,
        uniqueDiscoveredCount: nextDiscovered,
      };
    });
  }

  async function recordDiscoveryDocumentOutcome(input: {
    runId: string;
    externalId: string;
    outcome: 'DUPLICATE' | 'EXCLUDED' | 'READY_FOR_REVIEW' | 'FAILED';
    candidateDocumentId?: string;
    errorCode?: string;
    errorSummary?: string;
  }) {
    return database.transaction(async (transaction: Database) => {
      const documents = await transaction
        .select()
        .from(discoveryRunDocument)
        .where(
          and(
            eq(discoveryRunDocument.discoveryRunId, input.runId),
            eq(discoveryRunDocument.externalId, input.externalId)
          )
        )
        .for('update')
        .limit(1);
      if (!documents.length)
        throw new OperationsError('DISCOVERY_DOCUMENT_NOT_FOUND', 404);
      const runs = await transaction
        .select()
        .from(discoveryRun)
        .where(eq(discoveryRun.id, input.runId))
        .for('update')
        .limit(1);
      if (!runs.length)
        throw new OperationsError('DISCOVERY_RUN_NOT_FOUND', 404);
      const counts = discoveryCounts(runs[0].counts);
      let processedDocumentCount = Number(runs[0].processedDocumentCount ?? 0);
      if (documents[0].status === 'DISCOVERED') {
        if (input.outcome === 'DUPLICATE') counts.duplicate += 1;
        if (input.outcome === 'EXCLUDED') counts.excluded += 1;
        if (input.outcome === 'READY_FOR_REVIEW') counts.readyForReview += 1;
        if (input.outcome === 'FAILED') counts.failed += 1;
        processedDocumentCount += 1;
        await transaction
          .update(discoveryRunDocument)
          .set({
            status: input.outcome,
            candidateDocumentId: input.candidateDocumentId ?? null,
            errorCode: input.errorCode ?? null,
            errorSummary: input.errorSummary?.slice(0, 2_000) ?? null,
          })
          .where(eq(discoveryRunDocument.id, documents[0].id));
        await transaction
          .update(discoveryRun)
          .set({ counts, processedDocumentCount })
          .where(eq(discoveryRun.id, input.runId));
      }
      return { counts, processedDocumentCount };
    });
  }

  async function recordDiscoveryProvenance(
    input: Parameters<
      NonNullable<DiscoveryRunRepository['recordDiscoveryProvenance']>
    >[0]
  ) {
    await audit('system:civic', 'CIVIC_CANDIDATE_DISCOVERED', input.runId, {
      externalId: input.externalId,
      strategyId: input.strategyId,
      provenance: input.provenance,
    });
  }

  async function attachCandidateToDiscoveryStrategy(
    candidateDocumentId: string,
    strategyId: string
  ) {
    const rows = await database
      .select({ strategyIds: candidateDocument.matchedStrategyIds })
      .from(candidateDocument)
      .where(eq(candidateDocument.id, candidateDocumentId))
      .limit(1);
    if (!rows.length) return;
    await database
      .update(candidateDocument)
      .set({
        matchedStrategyIds: unique([
          ...asStringArray(rows[0].strategyIds),
          strategyId,
        ]),
      })
      .where(eq(candidateDocument.id, candidateDocumentId));
  }

  async function saveDiscoveryQueryProgress(input: {
    queryId: string;
    sourceCursor: string | null;
    exhausted: boolean;
  }) {
    await database
      .update(discoveryRunQuery)
      .set({
        sourceCursor: input.sourceCursor,
        exhausted: input.exhausted,
        fetchedPageCount: (await queryPageCount(database, input.queryId)) + 1,
      })
      .where(eq(discoveryRunQuery.id, input.queryId));
  }

  async function finishDiscoveryRun(input: {
    runId: string;
    status: 'SUCCEEDED' | 'PARTIAL_SUCCESS' | 'FAILED';
    errorCode?: string | null;
    errorSummary?: string | null;
  }) {
    await database.transaction(async (transaction: Database) => {
      const timestamp = now();
      const rows = await transaction
        .update(discoveryRun)
        .set({
          status: input.status,
          errorCode: input.errorCode ?? null,
          errorSummary: input.errorSummary ?? null,
          completedAt: timestamp,
        })
        .where(
          and(
            eq(discoveryRun.id, input.runId),
            eq(discoveryRun.status, 'RUNNING')
          )
        )
        .returning();
      if (!rows.length) return;
      if (
        input.status === 'SUCCEEDED' &&
        asRecord(rows[0].scopeSnapshot).source !== 'CIVIC'
      ) {
        const queries = await transaction
          .select({ strategyId: discoveryRunQuery.strategyId })
          .from(discoveryRunQuery)
          .where(eq(discoveryRunQuery.discoveryRunId, input.runId));
        const strategyIds = unique(
          queries.map((query: any) => query.strategyId)
        );
        if (strategyIds.length) {
          await transaction
            .update(discoveryStrategy)
            .set({ lastSuccessfulCutoffAt: rows[0].windowTo })
            .where(inArray(discoveryStrategy.id, strategyIds));
        }
      }
    });
  }

  async function touchWorkerHeartbeat(input: {
    workerId: string;
    status: 'IDLE' | 'RUNNING' | 'ERROR';
    currentJobId: string | null;
  }) {
    const timestamp = now();
    await database
      .insert(workerHeartbeat)
      .values({
        workerId: input.workerId,
        status: input.status,
        currentJobId: input.currentJobId,
        startedAt: timestamp,
        lastSeenAt: timestamp,
        metadata: {},
      })
      .onConflictDoUpdate({
        target: workerHeartbeat.workerId,
        set: {
          status: input.status,
          currentJobId: input.currentJobId,
          lastSeenAt: timestamp,
        },
      });
  }

  return {
    resolveDiscoveryScope,
    createManualDiscoveryRun,
    transitionDiscoveryRun,
    claimPlatformJob,
    completePlatformJob,
    failPlatformJob,
    beginDiscoveryRun,
    getDiscoveryRunStatus,
    claimDiscoveryDocument,
    recordDiscoveryDocumentOutcome,
    recordDiscoveryProvenance,
    attachCandidateToDiscoveryStrategy,
    saveDiscoveryQueryProgress,
    finishDiscoveryRun,
    touchWorkerHeartbeat,
  };
}

function jobResult(row: any): PersistentPlatformJob {
  return {
    id: row.id,
    jobType: row.jobType,
    resourceId: row.resourceId,
    payload: asRecord(row.payload),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
  };
}

function unique(values: string[]) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, 'en')
  );
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function discoveryCounts(value: unknown) {
  const source = asRecord(value);
  return {
    discovered: number(source.discovered),
    duplicate: number(source.duplicate),
    excluded: number(source.excluded),
    processing: number(source.processing),
    readyForReview: number(source.readyForReview),
    published: number(source.published),
    failed: number(source.failed),
  };
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

async function queryPageCount(database: Database, queryId: string) {
  const rows = await database
    .select({ count: discoveryRunQuery.fetchedPageCount })
    .from(discoveryRunQuery)
    .where(eq(discoveryRunQuery.id, queryId))
    .limit(1);
  return Number(rows[0]?.count ?? 0);
}

async function assertKnownIds(
  database: Database,
  requested: {
    diseaseIds: Set<string>;
    geneIds: Set<string>;
    variantIds: Set<string>;
  }
) {
  const [diseases, genes, variants] = await Promise.all([
    requested.diseaseIds.size
      ? database
          .select({ id: disease.id })
          .from(disease)
          .where(inArray(disease.id, [...requested.diseaseIds]))
      : [],
    requested.geneIds.size
      ? database
          .select({ id: gene.id })
          .from(gene)
          .where(inArray(gene.id, [...requested.geneIds]))
      : [],
    requested.variantIds.size
      ? database
          .select({ id: variant.id })
          .from(variant)
          .where(inArray(variant.id, [...requested.variantIds]))
      : [],
  ]);
  const unknown = [
    ...difference(requested.diseaseIds, diseases),
    ...difference(requested.geneIds, genes),
    ...difference(requested.variantIds, variants),
  ];
  if (unknown.length) {
    throw new OperationsError('DISCOVERY_SCOPE_UNKNOWN_ENTITY', 422, {
      ids: unknown,
    });
  }
}

function difference(requested: Set<string>, rows: Array<{ id: string }>) {
  const found = new Set(rows.map((row) => row.id));
  return [...requested].filter((id) => !found.has(id));
}
