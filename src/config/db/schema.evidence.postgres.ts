import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { envConfigs } from '@/config';

const schemaName = (envConfigs.db_schema || 'public').trim();
const customSchema =
  schemaName && schemaName !== 'public' ? pgSchema(schemaName) : null;
const table: typeof pgTable = customSchema
  ? (customSchema.table.bind(customSchema) as unknown as typeof pgTable)
  : pgTable;

const entityStatuses = ['ACTIVE', 'INACTIVE', 'DEPRECATED'] as const;
const reviewStatuses = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const;
const evidenceLevels = [
  '1',
  '2',
  '3A',
  '3B',
  '4',
  'R1',
  'R2',
  'UNRATED',
] as const;

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull();

export const disease = table(
  'disease',
  {
    id: text('id').primaryKey(),
    canonicalName: text('canonical_name').notNull().unique(),
    displayNameZh: text('display_name_zh').notNull(),
    displayNameEn: text('display_name_en').notNull(),
    ontologySystem: text('ontology_system'),
    ontologyCode: text('ontology_code'),
    lineage: text('lineage', {
      enum: ['SOLID', 'HEMATOLOGIC', 'UNKNOWN'],
    }).notNull(),
    aliases: jsonb('aliases')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status', { enum: entityStatuses }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_disease_ontology')
      .on(record.ontologySystem, record.ontologyCode)
      .where(
        sql`${record.ontologySystem} is not null and ${record.ontologyCode} is not null`
      ),
    check(
      'ck_disease_lineage',
      sql`${record.lineage} in ('SOLID', 'HEMATOLOGIC', 'UNKNOWN')`
    ),
    check(
      'ck_disease_status',
      sql`${record.status} in ('ACTIVE', 'INACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const gene = table(
  'gene',
  {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull().unique(),
    hgncId: text('hgnc_id').unique(),
    name: text('name').notNull(),
    aliases: jsonb('aliases')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status', { enum: entityStatuses }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    check(
      'ck_gene_symbol_upper',
      sql`${record.symbol} = upper(${record.symbol})`
    ),
    check(
      'ck_gene_status',
      sql`${record.status} in ('ACTIVE', 'INACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const variant = table(
  'variant',
  {
    id: text('id').primaryKey(),
    geneId: text('gene_id')
      .notNull()
      .references(() => gene.id),
    alterationType: text('alteration_type').notNull(),
    hgvsp: text('hgvsp'),
    hgvsc: text('hgvsc'),
    transcript: text('transcript'),
    canonicalKey: text('canonical_key').notNull().unique(),
    aliases: jsonb('aliases')
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status', { enum: entityStatuses }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_variant_gene').on(record.geneId),
    check(
      'ck_variant_status',
      sql`${record.status} in ('ACTIVE', 'INACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const drug = table(
  'drug',
  {
    id: text('id').primaryKey(),
    genericName: text('generic_name').notNull().unique(),
    displayNameZh: text('display_name_zh').notNull(),
    displayNameEn: text('display_name_en').notNull(),
    brandNames: jsonb('brand_names')
      .notNull()
      .default(sql`'[]'::jsonb`),
    aliases: jsonb('aliases')
      .notNull()
      .default(sql`'[]'::jsonb`),
    externalIds: jsonb('external_ids')
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status', { enum: entityStatuses }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    check(
      'ck_drug_status',
      sql`${record.status} in ('ACTIVE', 'INACTIVE', 'DEPRECATED')`
    ),
  ]
);

export const sourceDocument = table(
  'source_document',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type', { enum: ['PUBMED', 'FDA'] }).notNull(),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    publisherOrAgency: text('publisher_or_agency'),
    journal: text('journal'),
    publicationDate: date('publication_date'),
    doi: text('doi'),
    pmcid: text('pmcid'),
    url: text('url').notNull(),
    sourceScope: text('source_scope', {
      enum: [
        'ABSTRACT',
        'PMC_FULL_TEXT',
        'FDA_LABEL',
        'FDA_APPROVAL_RECORD',
        'OTHER',
      ],
    }).notNull(),
    language: text('language').notNull(),
    license: text('license'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
    documentHash: text('document_hash'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    reviewStatus: text('review_status', { enum: reviewStatuses }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_source_document_external').on(
      record.sourceType,
      record.externalId
    ),
    check(
      'ck_source_document_type',
      sql`${record.sourceType} in ('PUBMED', 'FDA')`
    ),
    check(
      'ck_source_document_scope',
      sql`${record.sourceScope} in ('ABSTRACT', 'PMC_FULL_TEXT', 'FDA_LABEL', 'FDA_APPROVAL_RECORD', 'OTHER')`
    ),
    check(
      'ck_source_document_review',
      sql`${record.reviewStatus} in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

export const sourcePassage = table(
  'source_passage',
  {
    id: text('id').primaryKey(),
    sourceDocumentId: text('source_document_id')
      .notNull()
      .references(() => sourceDocument.id),
    section: text('section'),
    paragraphIndex: integer('paragraph_index'),
    locator: jsonb('locator')
      .notNull()
      .default(sql`'{}'::jsonb`),
    originalText: text('original_text').notNull(),
    textHash: text('text_hash').notNull(),
    language: text('language').notNull(),
    displayPolicy: text('display_policy', {
      enum: ['FULL_TEXT', 'EXCERPT', 'LINK_ONLY', 'INTERNAL_ONLY'],
    }).notNull(),
    modelUsePolicy: text('model_use_policy', {
      enum: ['ALLOWED', 'PROHIBITED'],
    }).notNull(),
    publicExcerpt: text('public_excerpt'),
    contextBeforeId: text('context_before_id').references(
      (): AnyPgColumn => sourcePassage.id
    ),
    contextAfterId: text('context_after_id').references(
      (): AnyPgColumn => sourcePassage.id
    ),
    reviewStatus: text('review_status', { enum: reviewStatuses }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_source_passage_document_hash').on(
      record.sourceDocumentId,
      record.textHash
    ),
    index('idx_source_passage_document').on(record.sourceDocumentId),
    check(
      'ck_source_passage_display',
      sql`${record.displayPolicy} in ('FULL_TEXT', 'EXCERPT', 'LINK_ONLY', 'INTERNAL_ONLY')`
    ),
    check(
      'ck_source_passage_model_use',
      sql`${record.modelUsePolicy} in ('ALLOWED', 'PROHIBITED')`
    ),
    check(
      'ck_source_passage_review',
      sql`${record.reviewStatus} in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

export const therapeuticAssociation = table(
  'therapeutic_association',
  {
    id: text('id').primaryKey(),
    diseaseId: text('disease_id')
      .notNull()
      .references(() => disease.id),
    variantId: text('variant_id')
      .notNull()
      .references(() => variant.id),
    therapyKey: text('therapy_key').notNull(),
    direction: text('direction', {
      enum: ['SENSITIVITY', 'RESISTANCE', 'EXPLORATORY'],
    }).notNull(),
    variantApplicability: text('variant_applicability', {
      enum: [
        'EXACT',
        'EXPLICIT_GROUP_INCLUDES_EXACT',
        'GENE_ONLY',
        'ANALOGOUS_VARIANT',
        'UNKNOWN',
      ],
    }).notNull(),
    proposedLevel: text('proposed_level', { enum: evidenceLevels }).notNull(),
    approvedLevel: text('approved_level', { enum: evidenceLevels }),
    gradingRuleVersion: text('grading_rule_version').notNull(),
    gradingRationale: text('grading_rationale').notNull(),
    reviewStatus: text('review_status', { enum: reviewStatuses }).notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_therapeutic_association_identity').on(
      record.diseaseId,
      record.variantId,
      record.therapyKey,
      record.direction
    ),
    index('idx_association_retrieval').on(
      record.variantId,
      record.diseaseId,
      record.reviewStatus
    ),
    check(
      'ck_association_direction',
      sql`${record.direction} in ('SENSITIVITY', 'RESISTANCE', 'EXPLORATORY')`
    ),
    check(
      'ck_association_variant_applicability',
      sql`${record.variantApplicability} in ('EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT', 'GENE_ONLY', 'ANALOGOUS_VARIANT', 'UNKNOWN')`
    ),
    check(
      'ck_association_proposed_level',
      sql`${record.proposedLevel} in ('1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED')`
    ),
    check(
      'ck_association_approved_level',
      sql`${record.approvedLevel} is null or ${record.approvedLevel} in ('1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED')`
    ),
    check(
      'ck_association_review',
      sql`${record.reviewStatus} in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

export const therapeuticAssociationDrug = table(
  'therapeutic_association_drug',
  {
    associationId: text('association_id')
      .notNull()
      .references(() => therapeuticAssociation.id, { onDelete: 'cascade' }),
    drugId: text('drug_id')
      .notNull()
      .references(() => drug.id),
    role: text('role', {
      enum: ['PRIMARY', 'COMBINATION_COMPONENT'],
    }).notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (record) => [
    primaryKey({ columns: [record.associationId, record.drugId] }),
    uniqueIndex('uq_association_drug_order').on(
      record.associationId,
      record.sortOrder
    ),
    check(
      'ck_association_drug_role',
      sql`${record.role} in ('PRIMARY', 'COMBINATION_COMPONENT')`
    ),
  ]
);

export const evidenceClaim = table(
  'evidence_claim',
  {
    id: text('id').primaryKey(),
    associationId: text('association_id')
      .notNull()
      .references(() => therapeuticAssociation.id, { onDelete: 'cascade' }),
    claimType: text('claim_type', {
      enum: ['EFFICACY', 'RESISTANCE', 'SAFETY_CONTEXT', 'OTHER'],
    }).notNull(),
    evidenceMaturity: text('evidence_maturity', {
      enum: [
        'REGULATORY',
        'GUIDELINE',
        'MATURE_CLINICAL',
        'LIMITED_CLINICAL',
        'PRECLINICAL',
        'INSUFFICIENT',
      ],
    }).notNull(),
    studyType: text('study_type').notNull(),
    studyName: text('study_name'),
    populationSummary: text('population_summary').notNull(),
    sampleSize: integer('sample_size'),
    diseaseStage: text('disease_stage'),
    treatmentLine: text('treatment_line'),
    priorTherapy: text('prior_therapy'),
    intervention: text('intervention').notNull(),
    comparator: text('comparator'),
    endpoint: text('endpoint').notNull(),
    effectValue: jsonb('effect_value'),
    conclusion: text('conclusion').notNull(),
    limitations: text('limitations').notNull(),
    cohortFingerprint: text('cohort_fingerprint'),
    reviewStatus: text('review_status', { enum: reviewStatuses }).notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_evidence_claim_association').on(record.associationId),
    check(
      'ck_evidence_claim_type',
      sql`${record.claimType} in ('EFFICACY', 'RESISTANCE', 'SAFETY_CONTEXT', 'OTHER')`
    ),
    check(
      'ck_evidence_claim_maturity',
      sql`${record.evidenceMaturity} in ('REGULATORY', 'GUIDELINE', 'MATURE_CLINICAL', 'LIMITED_CLINICAL', 'PRECLINICAL', 'INSUFFICIENT')`
    ),
    check(
      'ck_evidence_claim_review',
      sql`${record.reviewStatus} in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

export const evidenceClaimPassage = table(
  'evidence_claim_passage',
  {
    evidenceClaimId: text('evidence_claim_id')
      .notNull()
      .references(() => evidenceClaim.id, { onDelete: 'cascade' }),
    sourcePassageId: text('source_passage_id')
      .notNull()
      .references(() => sourcePassage.id),
    supportRole: text('support_role', {
      enum: ['PRIMARY', 'CONTEXT', 'LIMITATION'],
    }).notNull(),
  },
  (record) => [
    primaryKey({ columns: [record.evidenceClaimId, record.sourcePassageId] }),
    check(
      'ck_evidence_claim_passage_role',
      sql`${record.supportRole} in ('PRIMARY', 'CONTEXT', 'LIMITATION')`
    ),
  ]
);

export const regulatoryApproval = table(
  'regulatory_approval',
  {
    id: text('id').primaryKey(),
    authority: text('authority').notNull(),
    applicationNumber: text('application_number').notNull(),
    submissionNumber: text('submission_number'),
    approvalStatus: text('approval_status', {
      enum: ['APPROVED', 'WITHDRAWN', 'INACTIVE', 'NOT_APPROVED', 'UNKNOWN'],
    }).notNull(),
    approvalDate: date('approval_date').notNull(),
    statusAsOf: date('status_as_of').notNull(),
    indicationText: text('indication_text').notNull(),
    biomarkerText: text('biomarker_text'),
    labelEffectiveDate: date('label_effective_date'),
    sourceDocumentId: text('source_document_id')
      .notNull()
      .references(() => sourceDocument.id),
    reviewStatus: text('review_status', { enum: reviewStatuses }).notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    uniqueIndex('uq_regulatory_approval_identity').on(
      record.authority,
      record.applicationNumber,
      record.submissionNumber
    ),
    index('idx_regulatory_approval_status').on(
      record.authority,
      record.approvalStatus,
      record.reviewStatus
    ),
    check(
      'ck_regulatory_approval_status',
      sql`${record.approvalStatus} in ('APPROVED', 'WITHDRAWN', 'INACTIVE', 'NOT_APPROVED', 'UNKNOWN')`
    ),
    check(
      'ck_regulatory_approval_review',
      sql`${record.reviewStatus} in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED')`
    ),
  ]
);

export const regulatoryApprovalDrug = table(
  'regulatory_approval_drug',
  {
    regulatoryApprovalId: text('regulatory_approval_id')
      .notNull()
      .references(() => regulatoryApproval.id, { onDelete: 'cascade' }),
    drugId: text('drug_id')
      .notNull()
      .references(() => drug.id),
  },
  (record) => [
    primaryKey({ columns: [record.regulatoryApprovalId, record.drugId] }),
  ]
);

export const regulatoryApprovalDisease = table(
  'regulatory_approval_disease',
  {
    regulatoryApprovalId: text('regulatory_approval_id')
      .notNull()
      .references(() => regulatoryApproval.id, { onDelete: 'cascade' }),
    diseaseId: text('disease_id')
      .notNull()
      .references(() => disease.id),
    scope: text('scope', { enum: ['EXACT', 'BROADER', 'OTHER'] }).notNull(),
  },
  (record) => [
    primaryKey({ columns: [record.regulatoryApprovalId, record.diseaseId] }),
    check(
      'ck_regulatory_approval_disease_scope',
      sql`${record.scope} in ('EXACT', 'BROADER', 'OTHER')`
    ),
  ]
);

export const regulatoryApprovalVariant = table(
  'regulatory_approval_variant',
  {
    regulatoryApprovalId: text('regulatory_approval_id')
      .notNull()
      .references(() => regulatoryApproval.id, { onDelete: 'cascade' }),
    variantId: text('variant_id')
      .notNull()
      .references(() => variant.id),
    scope: text('scope', {
      enum: ['EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT', 'GENE_ONLY'],
    }).notNull(),
  },
  (record) => [
    primaryKey({ columns: [record.regulatoryApprovalId, record.variantId] }),
    check(
      'ck_regulatory_approval_variant_scope',
      sql`${record.scope} in ('EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT', 'GENE_ONLY')`
    ),
  ]
);

export const regulatoryApprovalPassage = table(
  'regulatory_approval_passage',
  {
    regulatoryApprovalId: text('regulatory_approval_id')
      .notNull()
      .references(() => regulatoryApproval.id, { onDelete: 'cascade' }),
    sourcePassageId: text('source_passage_id')
      .notNull()
      .references(() => sourcePassage.id),
    supportRole: text('support_role', {
      enum: ['INDICATION', 'BIOMARKER', 'STATUS', 'CONTEXT'],
    }).notNull(),
  },
  (record) => [
    primaryKey({
      columns: [record.regulatoryApprovalId, record.sourcePassageId],
    }),
    check(
      'ck_regulatory_approval_passage_role',
      sql`${record.supportRole} in ('INDICATION', 'BIOMARKER', 'STATUS', 'CONTEXT')`
    ),
  ]
);

export const knowledgeRelease = table(
  'knowledge_release',
  {
    id: text('id').primaryKey(),
    version: text('version').notNull().unique(),
    status: text('status', {
      enum: ['DRAFT', 'PUBLISHED', 'RETIRED'],
    }).notNull(),
    literatureCutoffAt: timestamp('literature_cutoff_at', {
      withTimezone: true,
    }).notNull(),
    regulatoryCutoffAt: timestamp('regulatory_cutoff_at', {
      withTimezone: true,
    }).notNull(),
    gradingRuleVersion: text('grading_rule_version').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (record) => [
    index('idx_knowledge_release_status').on(record.status, record.publishedAt),
    check(
      'ck_knowledge_release_status',
      sql`${record.status} in ('DRAFT', 'PUBLISHED', 'RETIRED')`
    ),
    check(
      'ck_knowledge_release_published_metadata',
      sql`${record.status} <> 'PUBLISHED' or (${record.publishedAt} is not null and ${record.publishedBy} is not null)`
    ),
  ]
);

export const knowledgeReleaseAssociation = table(
  'knowledge_release_association',
  {
    knowledgeReleaseId: text('knowledge_release_id')
      .notNull()
      .references(() => knowledgeRelease.id, { onDelete: 'cascade' }),
    therapeuticAssociationId: text('therapeutic_association_id')
      .notNull()
      .references(() => therapeuticAssociation.id),
    approvedLevel: text('approved_level', { enum: evidenceLevels }).notNull(),
    gradingRationale: text('grading_rationale').notNull(),
  },
  (record) => [
    primaryKey({
      columns: [record.knowledgeReleaseId, record.therapeuticAssociationId],
    }),
    check(
      'ck_knowledge_release_association_approved_level',
      sql`${record.approvedLevel} in ('1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED')`
    ),
  ]
);

export const knowledgeReleaseApproval = table(
  'knowledge_release_approval',
  {
    knowledgeReleaseId: text('knowledge_release_id')
      .notNull()
      .references(() => knowledgeRelease.id, { onDelete: 'cascade' }),
    regulatoryApprovalId: text('regulatory_approval_id')
      .notNull()
      .references(() => regulatoryApproval.id),
  },
  (record) => [
    primaryKey({
      columns: [record.knowledgeReleaseId, record.regulatoryApprovalId],
    }),
  ]
);

export const answerSnapshot = table(
  'answer_snapshot',
  {
    id: text('id').primaryKey(),
    requestFingerprint: text('request_fingerprint').notNull(),
    knowledgeReleaseId: text('knowledge_release_id')
      .notNull()
      .references(() => knowledgeRelease.id),
    promptVersion: text('prompt_version').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    locale: text('locale').notNull(),
    evidenceIds: jsonb('evidence_ids').notNull(),
    associationIds: jsonb('association_ids').notNull(),
    regulatoryApprovalIds: jsonb('regulatory_approval_ids').notNull(),
    structuredOutput: jsonb('structured_output').notNull(),
    validationStatus: text('validation_status', {
      enum: ['VALID', 'INVALID'],
    }).notNull(),
    latencyMs: integer('latency_ms').notNull(),
    createdAt: createdAt(),
  },
  (record) => [
    uniqueIndex('uq_answer_snapshot_cache_key').on(
      record.requestFingerprint,
      record.knowledgeReleaseId,
      record.promptVersion,
      record.provider,
      record.model,
      record.locale
    ),
    check(
      'ck_answer_snapshot_validation',
      sql`${record.validationStatus} in ('VALID', 'INVALID')`
    ),
  ]
);
