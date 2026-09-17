import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { envConfigs } from '@/config';

import {
  evidenceClaim,
  knowledgeRelease,
  therapeuticAssociation,
} from './schema.evidence.postgres';

const schemaName = (envConfigs.db_schema || 'public').trim();
const customSchema =
  schemaName && schemaName !== 'public' ? pgSchema(schemaName) : null;
const table: typeof pgTable = customSchema
  ? (customSchema.table.bind(customSchema) as unknown as typeof pgTable)
  : pgTable;

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull();

export const skillVersion = table(
  'skill_version',
  {
    id: text('id').primaryKey(),
    skillId: text('skill_id').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    kind: text('kind', {
      enum: ['DETERMINISTIC', 'MODEL', 'HYBRID'],
    }).notNull(),
    description: text('description').notNull(),
    inputSchema: jsonb('input_schema').notNull(),
    outputSchema: jsonb('output_schema').notNull(),
    allowedTools: jsonb('allowed_tools')
      .notNull()
      .default(sql`'[]'::jsonb`),
    sideEffect: text('side_effect', {
      enum: ['NONE', 'STAGING_WRITE'],
    }).notNull(),
    timeoutMs: integer('timeout_ms').notNull(),
    maxAttempts: integer('max_attempts').notNull(),
    riskLevel: text('risk_level', {
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    }).notNull(),
    evaluationSuiteId: text('evaluation_suite_id'),
    status: text('status', {
      enum: ['DRAFT', 'ACTIVE', 'DEPRECATED'],
    }).notNull(),
    createdAt: createdAt(),
  },
  (record) => [
    uniqueIndex('uq_skill_version_identity').on(record.skillId, record.version),
    check(
      'ck_skill_version_kind',
      sql`${record.kind} in ('DETERMINISTIC', 'MODEL', 'HYBRID')`
    ),
    check(
      'ck_skill_version_side_effect',
      sql`${record.sideEffect} in ('NONE', 'STAGING_WRITE')`
    ),
    check(
      'ck_skill_version_limits',
      sql`${record.timeoutMs} > 0 and ${record.maxAttempts} > 0`
    ),
    check(
      'ck_skill_version_status',
      sql`${record.status} in ('DRAFT', 'ACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const agentVersion = table(
  'agent_version',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    goal: text('goal').notNull(),
    instructionsVersion: text('instructions_version').notNull(),
    allowedSkillVersions: jsonb('allowed_skill_versions').notNull(),
    allowedTools: jsonb('allowed_tools').notNull(),
    modelConfiguration: jsonb('model_configuration').notNull(),
    tokenAndCostBudget: jsonb('token_and_cost_budget').notNull(),
    stopConditions: jsonb('stop_conditions').notNull(),
    handoffConditions: jsonb('handoff_conditions').notNull(),
    failurePolicy: jsonb('failure_policy').notNull(),
    status: text('status', {
      enum: ['DRAFT', 'ACTIVE', 'DEPRECATED'],
    }).notNull(),
    createdAt: createdAt(),
  },
  (record) => [
    uniqueIndex('uq_agent_version_identity').on(record.agentId, record.version),
    check(
      'ck_agent_version_status',
      sql`${record.status} in ('DRAFT', 'ACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const workflowVersion = table(
  'workflow_version',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['UPSTREAM', 'DOWNSTREAM'] }).notNull(),
    definition: jsonb('definition').notNull(),
    status: text('status', {
      enum: ['DRAFT', 'ACTIVE', 'DEPRECATED'],
    }).notNull(),
    createdAt: createdAt(),
  },
  (record) => [
    uniqueIndex('uq_workflow_version_identity').on(
      record.workflowId,
      record.version
    ),
    check(
      'ck_workflow_version_kind',
      sql`${record.kind} in ('UPSTREAM', 'DOWNSTREAM')`
    ),
    check(
      'ck_workflow_version_status',
      sql`${record.status} in ('DRAFT', 'ACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const workflowRun = table(
  'workflow_run',
  {
    id: text('id').primaryKey(),
    workflowVersionId: text('workflow_version_id').references(
      () => workflowVersion.id
    ),
    workflowVersion: text('workflow_version').notNull(),
    kind: text('kind', { enum: ['UPSTREAM', 'DOWNSTREAM'] }).notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    status: text('status', {
      enum: [
        'PENDING',
        'RUNNING',
        'SUCCEEDED',
        'PARTIAL_SUCCESS',
        'NEEDS_HUMAN',
        'FAILED',
        'CANCELLED',
      ],
    }).notNull(),
    currentStep: text('current_step'),
    lockedKnowledgeReleaseId: text('locked_knowledge_release_id').references(
      () => knowledgeRelease.id
    ),
    inputHash: text('input_hash').notNull(),
    outputHash: text('output_hash'),
    errorCode: text('error_code'),
    totalInputTokens: integer('total_input_tokens').notNull().default(0),
    totalOutputTokens: integer('total_output_tokens').notNull().default(0),
    totalCostMicrousd: integer('total_cost_microusd').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_workflow_run_status').on(record.kind, record.status),
    check(
      'ck_workflow_run_kind',
      sql`${record.kind} in ('UPSTREAM', 'DOWNSTREAM')`
    ),
    check(
      'ck_workflow_run_status',
      sql`${record.status} in ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL_SUCCESS', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED')`
    ),
  ]
);

export const workflowStepRun = table(
  'workflow_step_run',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRun.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    attempt: integer('attempt').notNull(),
    status: text('status', {
      enum: [
        'PENDING',
        'RUNNING',
        'SUCCEEDED',
        'RETRY_WAIT',
        'NEEDS_HUMAN',
        'FAILED',
        'CANCELLED',
      ],
    }).notNull(),
    skillVersionId: text('skill_version_id').references(() => skillVersion.id),
    agentVersionId: text('agent_version_id').references(() => agentVersion.id),
    inputHash: text('input_hash').notNull(),
    outputHash: text('output_hash'),
    errorCode: text('error_code'),
    errorSummary: text('error_summary'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costMicrousd: integer('cost_microusd').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (record) => [
    uniqueIndex('uq_workflow_step_attempt').on(
      record.workflowRunId,
      record.stepKey,
      record.attempt
    ),
    index('idx_workflow_step_status').on(record.workflowRunId, record.status),
    check('ck_workflow_step_attempt', sql`${record.attempt} > 0`),
    check(
      'ck_workflow_step_status',
      sql`${record.status} in ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED')`
    ),
  ]
);

export const workflowArtifact = table(
  'workflow_artifact',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRun.id, { onDelete: 'cascade' }),
    artifactType: text('artifact_type').notNull(),
    schemaVersion: text('schema_version').notNull(),
    createdByType: text('created_by_type', {
      enum: ['AGENT', 'SKILL', 'USER', 'SYSTEM'],
    }).notNull(),
    createdById: text('created_by_id').notNull(),
    inputArtifactIds: jsonb('input_artifact_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    content: jsonb('content').notNull(),
    contentHash: text('content_hash').notNull(),
    sensitivity: text('sensitivity', {
      enum: ['PUBLIC', 'INTERNAL', 'SENSITIVE'],
    }).notNull(),
    publicPolicy: text('public_policy', {
      enum: ['PUBLIC', 'SUMMARY_ONLY', 'INTERNAL_ONLY'],
    }).notNull(),
    createdAt: createdAt(),
  },
  (record) => [
    uniqueIndex('uq_workflow_artifact_hash').on(
      record.workflowRunId,
      record.artifactType,
      record.contentHash
    ),
    index('idx_workflow_artifact_run').on(record.workflowRunId),
    check(
      'ck_workflow_artifact_creator',
      sql`${record.createdByType} in ('AGENT', 'SKILL', 'USER', 'SYSTEM')`
    ),
    check(
      'ck_workflow_artifact_sensitivity',
      sql`${record.sensitivity} in ('PUBLIC', 'INTERNAL', 'SENSITIVE')`
    ),
    check(
      'ck_workflow_artifact_public_policy',
      sql`${record.publicPolicy} in ('PUBLIC', 'SUMMARY_ONLY', 'INTERNAL_ONLY')`
    ),
  ]
);

export const candidateDocument = table(
  'candidate_document',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type', { enum: ['PUBMED'] }).notNull(),
    externalId: text('external_id').notNull(),
    doi: text('doi'),
    documentHash: text('document_hash'),
    title: text('title').notNull(),
    abstract: text('abstract').notNull(),
    journal: text('journal'),
    publicationDate: text('publication_date'),
    pmcid: text('pmcid'),
    sourceScope: text('source_scope', {
      enum: ['ABSTRACT', 'PMC_FULL_TEXT'],
    })
      .notNull()
      .default('ABSTRACT'),
    sourceLicense: text('source_license'),
    sourceLicensePolicy: jsonb('source_license_policy'),
    fullText: text('full_text'),
    sourceUrl: text('source_url').notNull(),
    matchedStrategyIds: jsonb('matched_strategy_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status', {
      enum: [
        'DISCOVERED',
        'DUPLICATE',
        'EXCLUDED',
        'QUEUED',
        'PROCESSING',
        'NEEDS_HUMAN',
        'READY_FOR_REVIEW',
        'REJECTED',
        'PUBLISHED',
        'FAILED',
      ],
    }).notNull(),
    duplicateOfId: text('duplicate_of_id').references(
      (): AnyPgColumn => candidateDocument.id
    ),
    exclusionReason: jsonb('exclusion_reason'),
    activeWorkflowRunId: text('active_workflow_run_id').references(
      () => workflowRun.id
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_candidate_source_identity').on(
      record.sourceType,
      record.externalId
    ),
    uniqueIndex('uq_candidate_doi')
      .on(record.doi)
      .where(sql`${record.doi} is not null`),
    uniqueIndex('uq_candidate_document_hash')
      .on(record.documentHash)
      .where(sql`${record.documentHash} is not null`),
    index('idx_candidate_status').on(record.status, record.createdAt),
    check('ck_candidate_source_type', sql`${record.sourceType} = 'PUBMED'`),
    check(
      'ck_candidate_source_scope',
      sql`${record.sourceScope} in ('ABSTRACT', 'PMC_FULL_TEXT')`
    ),
    check(
      'ck_candidate_status',
      sql`${record.status} in ('DISCOVERED', 'DUPLICATE', 'EXCLUDED', 'QUEUED', 'PROCESSING', 'NEEDS_HUMAN', 'READY_FOR_REVIEW', 'REJECTED', 'PUBLISHED', 'FAILED')`
    ),
  ]
);

export const evidenceDraft = table(
  'evidence_draft',
  {
    id: text('id').primaryKey(),
    candidateDocumentId: text('candidate_document_id')
      .notNull()
      .references(() => candidateDocument.id),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRun.id),
    associationId: text('association_id')
      .notNull()
      .references(() => therapeuticAssociation.id),
    draftVersion: integer('draft_version').notNull(),
    status: text('status', {
      enum: ['DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED'],
    }).notNull(),
    payload: jsonb('payload').notNull(),
    fieldProvenance: jsonb('field_provenance').notNull(),
    agentVersion: text('agent_version').notNull(),
    skillVersions: jsonb('skill_versions').notNull(),
    proposedLevel: text('proposed_level').notNull(),
    gradingRationale: text('grading_rationale').notNull(),
    qaIssues: jsonb('qa_issues')
      .notNull()
      .default(sql`'[]'::jsonb`),
    parentDraftId: text('parent_draft_id').references(
      (): AnyPgColumn => evidenceDraft.id
    ),
    editedBy: text('edited_by'),
    editReason: text('edit_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_evidence_draft_version').on(
      record.candidateDocumentId,
      record.draftVersion
    ),
    index('idx_evidence_draft_workflow').on(record.workflowRunId),
    check('ck_evidence_draft_version', sql`${record.draftVersion} > 0`),
    check(
      'ck_evidence_draft_status',
      sql`${record.status} in ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

export const discoveryStrategy = table(
  'discovery_strategy',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    query: text('query').notNull(),
    associationId: text('association_id')
      .notNull()
      .references(() => therapeuticAssociation.id),
    status: text('status', { enum: ['ACTIVE', 'PAUSED'] }).notNull(),
    scheduleTimezone: text('schedule_timezone')
      .notNull()
      .default('Asia/Shanghai'),
    scheduleRrule: text('schedule_rrule'),
    overlapDays: integer('overlap_days').notNull().default(7),
    maxResults: integer('max_results').notNull().default(100),
    lastSuccessfulCutoffAt: timestamp('last_successful_cutoff_at', {
      withTimezone: true,
    }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_discovery_strategy_version').on(record.id, record.version),
    index('idx_discovery_strategy_status').on(record.status, record.nextRunAt),
    check(
      'ck_discovery_strategy_status',
      sql`${record.status} in ('ACTIVE', 'PAUSED')`
    ),
    check(
      'ck_discovery_strategy_limits',
      sql`${record.overlapDays} >= 0 and ${record.maxResults} > 0 and ${record.maxResults} <= 10000`
    ),
  ]
);

export const discoveryRun = table(
  'discovery_run',
  {
    id: text('id').primaryKey(),
    strategyId: text('strategy_id')
      .notNull()
      .references(() => discoveryStrategy.id),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    triggerType: text('trigger_type', {
      enum: ['MANUAL', 'SCHEDULED'],
    }).notNull(),
    triggeredBy: text('triggered_by').notNull(),
    workflowVersion: text('workflow_version').notNull(),
    scopeMode: text('scope_mode', {
      enum: ['ALL_KNOWLEDGE', 'SCOPED'],
    })
      .notNull()
      .default('SCOPED'),
    scopeSnapshot: jsonb('scope_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),
    documentLimit: integer('document_limit'),
    estimatedMatchCount: integer('estimated_match_count').notNull().default(0),
    uniqueDiscoveredCount: integer('unique_discovered_count')
      .notNull()
      .default(0),
    processedDocumentCount: integer('processed_document_count')
      .notNull()
      .default(0),
    previewHash: text('preview_hash'),
    windowFrom: timestamp('window_from', { withTimezone: true }).notNull(),
    windowTo: timestamp('window_to', { withTimezone: true }).notNull(),
    status: text('status', {
      enum: [
        'PENDING',
        'RUNNING',
        'SUCCEEDED',
        'PARTIAL_SUCCESS',
        'PAUSED',
        'FAILED',
        'CANCELLED',
      ],
    }).notNull(),
    counts: jsonb('counts')
      .notNull()
      .default(
        sql`'{"discovered":0,"duplicate":0,"excluded":0,"processing":0,"readyForReview":0,"published":0,"failed":0}'::jsonb`
      ),
    sourceCursor: text('source_cursor'),
    errorCode: text('error_code'),
    errorSummary: text('error_summary'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_discovery_run_strategy').on(record.strategyId, record.createdAt),
    index('idx_discovery_run_status').on(record.status, record.createdAt),
    check(
      'ck_discovery_run_trigger',
      sql`${record.triggerType} in ('MANUAL', 'SCHEDULED')`
    ),
    check(
      'ck_discovery_run_status',
      sql`${record.status} in ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL_SUCCESS', 'PAUSED', 'FAILED', 'CANCELLED')`
    ),
    check(
      'ck_discovery_run_scope_mode',
      sql`${record.scopeMode} in ('ALL_KNOWLEDGE', 'SCOPED')`
    ),
    check(
      'ck_discovery_run_document_limit',
      sql`${record.documentLimit} is null or ${record.documentLimit} in (50, 100)`
    ),
    check(
      'ck_discovery_run_progress',
      sql`${record.estimatedMatchCount} >= 0 and ${record.uniqueDiscoveredCount} >= 0 and ${record.processedDocumentCount} >= 0 and ${record.processedDocumentCount} <= ${record.uniqueDiscoveredCount}`
    ),
    check(
      'ck_discovery_run_window',
      sql`${record.windowFrom} <= ${record.windowTo}`
    ),
  ]
);

export const discoveryRunQuery = table(
  'discovery_run_query',
  {
    id: text('id').primaryKey(),
    discoveryRunId: text('discovery_run_id')
      .notNull()
      .references(() => discoveryRun.id, { onDelete: 'cascade' }),
    strategyId: text('strategy_id')
      .notNull()
      .references(() => discoveryStrategy.id),
    strategyVersion: text('strategy_version').notNull(),
    associationId: text('association_id')
      .notNull()
      .references(() => therapeuticAssociation.id),
    query: text('query').notNull(),
    label: text('label').notNull(),
    estimatedMatchCount: integer('estimated_match_count').notNull().default(0),
    sourceCursor: text('source_cursor'),
    fetchedPageCount: integer('fetched_page_count').notNull().default(0),
    exhausted: boolean('exhausted').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_discovery_run_query_strategy').on(
      record.discoveryRunId,
      record.strategyId
    ),
    index('idx_discovery_run_query_progress').on(
      record.discoveryRunId,
      record.exhausted
    ),
    check(
      'ck_discovery_run_query_counts',
      sql`${record.estimatedMatchCount} >= 0 and ${record.fetchedPageCount} >= 0`
    ),
  ]
);

export const discoveryRunDocument = table(
  'discovery_run_document',
  {
    id: text('id').primaryKey(),
    discoveryRunId: text('discovery_run_id')
      .notNull()
      .references(() => discoveryRun.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    matchedStrategyIds: jsonb('matched_strategy_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status', {
      enum: [
        'DISCOVERED',
        'DUPLICATE',
        'EXCLUDED',
        'READY_FOR_REVIEW',
        'FAILED',
      ],
    }).notNull(),
    candidateDocumentId: text('candidate_document_id').references(
      () => candidateDocument.id
    ),
    errorCode: text('error_code'),
    errorSummary: text('error_summary'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_discovery_run_document').on(
      record.discoveryRunId,
      record.externalId
    ),
    index('idx_discovery_run_document_status').on(
      record.discoveryRunId,
      record.status
    ),
    check(
      'ck_discovery_run_document_status',
      sql`${record.status} in ('DISCOVERED', 'DUPLICATE', 'EXCLUDED', 'READY_FOR_REVIEW', 'FAILED')`
    ),
  ]
);

export const platformJob = table(
  'platform_job',
  {
    id: text('id').primaryKey(),
    jobType: text('job_type', {
      enum: ['DISCOVERY_RUN', 'CANDIDATE_RETRY', 'QUESTION_RUN'],
    }).notNull(),
    resourceId: text('resource_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status', {
      enum: [
        'QUEUED',
        'RUNNING',
        'RETRY_WAIT',
        'PAUSED',
        'SUCCEEDED',
        'DEAD_LETTER',
        'CANCELLED',
      ],
    }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastErrorCode: text('last_error_code'),
    lastErrorSummary: text('last_error_summary'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_platform_job_claim').on(record.status, record.availableAt),
    index('idx_platform_job_resource').on(record.jobType, record.resourceId),
    check(
      'ck_platform_job_type',
      sql`${record.jobType} in ('DISCOVERY_RUN', 'CANDIDATE_RETRY', 'QUESTION_RUN')`
    ),
    check(
      'ck_platform_job_status',
      sql`${record.status} in ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'PAUSED', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED')`
    ),
    check(
      'ck_platform_job_attempts',
      sql`${record.attempts} >= 0 and ${record.maxAttempts} > 0 and ${record.attempts} <= ${record.maxAttempts}`
    ),
  ]
);

export const workerHeartbeat = table(
  'worker_heartbeat',
  {
    workerId: text('worker_id').primaryKey(),
    status: text('status', { enum: ['IDLE', 'RUNNING', 'ERROR'] }).notNull(),
    currentJobId: text('current_job_id').references(() => platformJob.id),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (record) => [
    index('idx_worker_heartbeat_seen').on(record.lastSeenAt),
    check(
      'ck_worker_heartbeat_status',
      sql`${record.status} in ('IDLE', 'RUNNING', 'ERROR')`
    ),
  ]
);

export const rateLimitBucket = table(
  'rate_limit_bucket',
  {
    key: text('key').primaryKey(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
  },
  (record) => [index('idx_rate_limit_bucket_updated').on(record.updatedAt)]
);

export const platformAuditEvent = table(
  'platform_audit_event',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (record) => [
    index('idx_platform_audit_resource').on(
      record.resourceType,
      record.resourceId,
      record.createdAt
    ),
    index('idx_platform_audit_actor').on(record.actorId, record.createdAt),
  ]
);

export const reviewTask = table(
  'review_task',
  {
    id: text('id').primaryKey(),
    candidateDocumentId: text('candidate_document_id')
      .notNull()
      .references(() => candidateDocument.id),
    evidenceDraftId: text('evidence_draft_id')
      .notNull()
      .references(() => evidenceDraft.id),
    draftVersion: integer('draft_version').notNull(),
    status: text('status', {
      enum: [
        'PENDING',
        'IN_REVIEW',
        'REQUESTED_CHANGES',
        'READY_FOR_REVIEW',
        'REJECTED',
        'PUBLISHING',
        'PUBLISHED',
        'PUBLISH_FAILED',
      ],
    }).notNull(),
    lockVersion: integer('lock_version').notNull().default(1),
    assignedTo: text('assigned_to'),
    publishedReleaseId: text('published_release_id').references(
      () => knowledgeRelease.id
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_review_task_draft').on(record.evidenceDraftId),
    index('idx_review_task_status').on(record.status, record.createdAt),
    check('ck_review_task_lock_version', sql`${record.lockVersion} > 0`),
    check(
      'ck_review_task_status',
      sql`${record.status} in ('PENDING', 'IN_REVIEW', 'REQUESTED_CHANGES', 'READY_FOR_REVIEW', 'REJECTED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED')`
    ),
  ]
);

export const reviewDecision = table(
  'review_decision',
  {
    id: text('id').primaryKey(),
    reviewTaskId: text('review_task_id')
      .notNull()
      .references(() => reviewTask.id),
    decision: text('decision', {
      enum: ['REQUEST_CHANGES', 'REJECT', 'APPROVE_AND_PUBLISH'],
    }).notNull(),
    expectedDraftVersion: integer('expected_draft_version').notNull(),
    actorId: text('actor_id').notNull(),
    comment: text('comment').notNull(),
    requestedFields: jsonb('requested_fields')
      .notNull()
      .default(sql`'[]'::jsonb`),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    resultReleaseId: text('result_release_id').references(
      () => knowledgeRelease.id
    ),
    createdAt: createdAt(),
  },
  (record) => [
    index('idx_review_decision_task').on(record.reviewTaskId, record.createdAt),
    check(
      'ck_review_decision_type',
      sql`${record.decision} in ('REQUEST_CHANGES', 'REJECT', 'APPROVE_AND_PUBLISH')`
    ),
  ]
);

export const knowledgeChangeSet = table(
  'knowledge_change_set',
  {
    id: text('id').primaryKey(),
    reviewTaskId: text('review_task_id')
      .notNull()
      .references(() => reviewTask.id),
    contentHash: text('content_hash').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status', {
      enum: ['PENDING', 'VALIDATED', 'PUBLISHED', 'FAILED'],
    }).notNull(),
    targetVersion: text('target_version').notNull(),
    resultReleaseId: text('result_release_id').references(
      () => knowledgeRelease.id
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_change_set_review_hash').on(
      record.reviewTaskId,
      record.contentHash
    ),
    check(
      'ck_change_set_status',
      sql`${record.status} in ('PENDING', 'VALIDATED', 'PUBLISHED', 'FAILED')`
    ),
  ]
);

export const knowledgeReleaseClaim = table(
  'knowledge_release_claim',
  {
    knowledgeReleaseId: text('knowledge_release_id')
      .notNull()
      .references(() => knowledgeRelease.id, { onDelete: 'cascade' }),
    evidenceClaimId: text('evidence_claim_id')
      .notNull()
      .references(() => evidenceClaim.id),
  },
  (record) => [
    uniqueIndex('uq_knowledge_release_claim').on(
      record.knowledgeReleaseId,
      record.evidenceClaimId
    ),
    index('idx_knowledge_release_claim_release').on(record.knowledgeReleaseId),
  ]
);

export const questionRun = table(
  'question_run',
  {
    id: text('id').primaryKey(),
    questionHash: text('question_hash').notNull(),
    redactedQuestion: text('redacted_question').notNull(),
    locale: text('locale').notNull(),
    context: jsonb('context').notNull(),
    normalizedQuestion: jsonb('normalized_question'),
    status: text('status', {
      enum: [
        'PENDING',
        'RUNNING',
        'NEEDS_CLARIFICATION',
        'ANSWERED',
        'NO_CURATED_EVIDENCE',
        'OUT_OF_SCOPE',
        'SUMMARY_UNAVAILABLE',
        'FAILED',
        'CANCELLED',
      ],
    }).notNull(),
    knowledgeReleaseId: text('knowledge_release_id')
      .notNull()
      .references(() => knowledgeRelease.id),
    workflowRunId: text('workflow_run_id').references(() => workflowRun.id),
    publicResult: jsonb('public_result'),
    errorCode: text('error_code'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_question_run_status').on(record.status, record.createdAt),
    index('idx_question_run_release_hash').on(
      record.knowledgeReleaseId,
      record.questionHash
    ),
    check(
      'ck_question_run_status',
      sql`${record.status} in ('PENDING', 'RUNNING', 'NEEDS_CLARIFICATION', 'ANSWERED', 'NO_CURATED_EVIDENCE', 'OUT_OF_SCOPE', 'SUMMARY_UNAVAILABLE', 'FAILED', 'CANCELLED')`
    ),
  ]
);

export const userFeedback = table(
  'user_feedback',
  {
    id: text('id').primaryKey(),
    questionRunId: text('question_run_id')
      .notNull()
      .references(() => questionRun.id),
    answerVersion: text('answer_version').notNull(),
    knowledgeReleaseId: text('knowledge_release_id')
      .notNull()
      .references(() => knowledgeRelease.id),
    category: text('category', {
      enum: [
        'HELPFUL',
        'NOT_HELPFUL',
        'IRRELEVANT_CITATION',
        'MISSING_LIMITATION',
        'HARD_TO_UNDERSTAND',
        'OTHER',
      ],
    }).notNull(),
    comment: text('comment'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: createdAt(),
  },
  (record) => [
    index('idx_user_feedback_question').on(record.questionRunId),
    check(
      'ck_user_feedback_category',
      sql`${record.category} in ('HELPFUL', 'NOT_HELPFUL', 'IRRELEVANT_CITATION', 'MISSING_LIMITATION', 'HARD_TO_UNDERSTAND', 'OTHER')`
    ),
  ]
);
