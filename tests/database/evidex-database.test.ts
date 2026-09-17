import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { searchKnowledge } from '@/shared/services/evidence-platform/knowledge-catalog';
import { triggerDiscoveryRun } from '@/shared/services/evidence-platform/operations';
import { processNextPlatformJob } from '@/shared/services/evidence-platform/persistent-worker';
import { createPostgresDiscoveryRunRepository } from '@/shared/services/evidence-platform/postgres-discovery-repository';
import { createPostgresOperationsRepository } from '@/shared/services/evidence-platform/postgres-operations-repository';
import {
  createPostgresKnowledgeCatalogRepository,
  createPostgresQuestionRunRepository,
  createPostgresReviewPublishRepository,
  createPostgresUpstreamWorkflowRepository,
} from '@/shared/services/evidence-platform/postgres-platform-repository';
import {
  createQuestionFeedback,
  processEvidenceQuestionRun,
  retryEvidenceQuestionRun,
  submitEvidenceQuestion,
} from '@/shared/services/evidence-platform/question-workflow';
import { decideReviewTask } from '@/shared/services/evidence-platform/review-publish';
import { submitPubmedCandidate } from '@/shared/services/evidence-platform/upstream-workflow';
import { createPostgresEvidenceRepository } from '@/shared/services/evidence/postgres-evidence-repository';

const migrationsFolder = 'src/config/db/migrations';
const databaseUrl = process.env.DATABASE_URL;
const testSchema = `evidex_test_${randomUUID().replaceAll('-', '')}`;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for the explicit database test');
}

// The application uses Neon's pooled endpoint, but this test relies on a
// session-scoped search_path for schema isolation. Transaction poolers may
// switch server connections between statements, so use the matching direct
// endpoint for the test session.
const directDatabaseUrl = (() => {
  const url = new URL(databaseUrl);
  url.hostname = url.hostname.replace('-pooler.', '.');
  return url.toString();
})();

const admin = postgres(directDatabaseUrl, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
let client: ReturnType<typeof postgres> | undefined;

describe('Evidex PostgreSQL migration', () => {
  beforeAll(async () => {
    await access(`${migrationsFolder}/meta/_journal.json`);
    await admin.unsafe(`create schema "${testSchema}"`);

    client = postgres(directDatabaseUrl, {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    await client.unsafe(`set search_path to "${testSchema}"`);
    const database = drizzle(client);
    await migrate(database, {
      migrationsFolder,
      migrationsSchema: testSchema,
      migrationsTable: '__evidex_migrations',
    });
  }, 300_000);

  afterAll(async () => {
    if (client) {
      await client.unsafe('set search_path to public');
      await client.unsafe(`drop schema if exists "${testSchema}" cascade`);
      await client.end({ timeout: 1 });
    }
    await admin.end({ timeout: 1 });
  }, 30_000);

  it('creates the complete Evidex knowledge and snapshot table set', async () => {
    const rows = await admin`
      select table_name
      from information_schema.tables
      where table_schema = ${testSchema}
      order by table_name
    `;

    expect(rows.map(({ table_name }) => table_name)).toEqual(
      expect.arrayContaining([
        'answer_snapshot',
        'disease',
        'drug',
        'evidence_claim',
        'evidence_claim_passage',
        'gene',
        'knowledge_release',
        'knowledge_release_approval',
        'knowledge_release_association',
        'knowledge_release_claim',
        'candidate_document',
        'discovery_run',
        'discovery_run_document',
        'discovery_run_query',
        'discovery_strategy',
        'evidence_draft',
        'platform_audit_event',
        'platform_job',
        'rate_limit_bucket',
        'review_decision',
        'review_task',
        'skill_version',
        'workflow_artifact',
        'workflow_run',
        'workflow_step_run',
        'worker_heartbeat',
        'regulatory_approval',
        'regulatory_approval_disease',
        'regulatory_approval_drug',
        'regulatory_approval_passage',
        'regulatory_approval_variant',
        'source_document',
        'source_passage',
        'therapeutic_association',
        'therapeutic_association_drug',
        'variant',
      ])
    );

    const releaseAssociationColumns = await admin`
      select column_name, is_nullable
      from information_schema.columns
      where table_schema = ${testSchema}
        and table_name = 'knowledge_release_association'
      order by column_name
    `;
    expect(releaseAssociationColumns).toEqual(
      expect.arrayContaining([
        { column_name: 'approved_level', is_nullable: 'NO' },
        { column_name: 'grading_rationale', is_nullable: 'NO' },
      ])
    );
  });

  it('enforces identity uniqueness and foreign keys', async () => {
    await client!`
      insert into gene (id, symbol, name, aliases, status)
      values ('gene_egfr', 'EGFR', 'epidermal growth factor receptor', '[]', 'ACTIVE')
    `;

    await expect(
      client!`
        insert into gene (id, symbol, name, aliases, status)
        values ('gene_duplicate', 'EGFR', 'duplicate', '[]', 'ACTIVE')
      `
    ).rejects.toMatchObject({ code: '23505' });

    await expect(
      client!`
        insert into variant (
          id, gene_id, alteration_type, hgvsp, canonical_key, aliases, status
        ) values (
          'variant_invalid', 'missing_gene', 'SNV', 'p.L858R',
          'MISSING|SNV|p.L858R', '[]', 'ACTIVE'
        )
      `
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('prevents an already published knowledge release from being changed', async () => {
    await client!`
      insert into knowledge_release (
        id, version, status, literature_cutoff_at, regulatory_cutoff_at,
        grading_rule_version, published_at, published_by, notes
      ) values (
        'release_v0', 'v0.1.0', 'PUBLISHED', now(), now(),
        'evidex-therapeutic-v1', now(), 'reviewer', 'immutable snapshot'
      )
    `;

    await expect(
      client!`
        update knowledge_release
        set notes = 'changed'
        where id = 'release_v0'
      `
    ).rejects.toThrow(/published knowledge release is immutable/i);
  });

  it('retrieves only released, reviewed, FDA-eligible direct and exact cross-indication evidence', async () => {
    await client!.begin(async (transaction) => {
      await transaction`
        insert into disease (
          id, canonical_name, display_name_zh, display_name_en, lineage, aliases, status
        ) values
          ('disease_nsclc', 'NSCLC', '非小细胞肺癌', 'Non-small cell lung cancer', 'SOLID', '[]', 'ACTIVE'),
          ('disease_crc', 'CRC', '结直肠癌', 'Colorectal cancer', 'SOLID', '[]', 'ACTIVE')
      `;
      await transaction`
        insert into variant (
          id, gene_id, alteration_type, hgvsp, canonical_key, aliases, status
        ) values (
          'variant_l858r', 'gene_egfr', 'SNV', 'p.L858R',
          'EGFR|SNV|p.L858R', '[]', 'ACTIVE'
        )
      `;
      await transaction`
        insert into drug (
          id, generic_name, display_name_zh, display_name_en,
          brand_names, aliases, external_ids, status
        ) values
          ('drug_match', 'osimertinib', '奥希替尼', 'osimertinib', '[]', '[]', '{}', 'ACTIVE'),
          ('drug_other', 'exampletinib', '示例替尼', 'exampletinib', '[]', '[]', '{}', 'ACTIVE'),
          ('drug_no_fda', 'unapprovedtinib', '未批准替尼', 'unapprovedtinib', '[]', '[]', '{}', 'ACTIVE')
      `;
      await transaction`
        insert into source_document (
          id, source_type, external_id, title, url, source_scope, language,
          retrieved_at, metadata, review_status
        ) values
          ('doc_pubmed_direct', 'PUBMED', '11111111', 'Direct study', 'https://pubmed.ncbi.nlm.nih.gov/11111111/', 'ABSTRACT', 'en', now(), '{}', 'APPROVED'),
          ('doc_pubmed_cross', 'PUBMED', '22222222', 'Cross study', 'https://pubmed.ncbi.nlm.nih.gov/22222222/', 'ABSTRACT', 'en', now(), '{}', 'APPROVED'),
          ('doc_fda_match', 'FDA', 'FDA-MATCH', 'Matched label', 'https://www.accessdata.fda.gov/match', 'FDA_LABEL', 'en', now(), '{}', 'APPROVED'),
          ('doc_fda_other', 'FDA', 'FDA-OTHER', 'Other label', 'https://www.accessdata.fda.gov/other', 'FDA_LABEL', 'en', now(), '{}', 'APPROVED')
      `;
      await transaction`
        insert into source_passage (
          id, source_document_id, section, paragraph_index, locator,
          original_text, text_hash, language, display_policy,
          model_use_policy, public_excerpt, review_status
        ) values
          ('passage_direct', 'doc_pubmed_direct', 'Abstract', 1, '{}', 'Direct reviewed evidence.', 'hash-direct', 'en', 'EXCERPT', 'ALLOWED', 'Direct excerpt.', 'APPROVED'),
          ('passage_cross', 'doc_pubmed_cross', 'Abstract', 1, '{}', 'Cross reviewed evidence.', 'hash-cross', 'en', 'LINK_ONLY', 'ALLOWED', null, 'APPROVED'),
          ('passage_fda_match', 'doc_fda_match', 'Indications', 1, '{}', 'NSCLC EGFR L858R indication.', 'hash-fda-match', 'en', 'LINK_ONLY', 'PROHIBITED', null, 'APPROVED'),
          ('passage_fda_other', 'doc_fda_other', 'Indications', 1, '{}', 'CRC indication.', 'hash-fda-other', 'en', 'LINK_ONLY', 'PROHIBITED', null, 'APPROVED')
      `;
      await transaction`
        insert into therapeutic_association (
          id, disease_id, variant_id, therapy_key, direction,
          variant_applicability, proposed_level, approved_level,
          grading_rule_version, grading_rationale, review_status,
          reviewed_by, reviewed_at
        ) values
          ('assoc_direct', 'disease_nsclc', 'variant_l858r', 'drug_match:PRIMARY', 'SENSITIVITY', 'EXACT', '1', '1', 'evidex-therapeutic-v1', 'reviewed direct', 'APPROVED', 'reviewer', now()),
          ('assoc_cross', 'disease_crc', 'variant_l858r', 'drug_other:PRIMARY', 'SENSITIVITY', 'EXACT', '3A', '3A', 'evidex-therapeutic-v1', 'reviewed cross', 'APPROVED', 'reviewer', now()),
          ('assoc_cross_group', 'disease_crc', 'variant_l858r', 'drug_match:PRIMARY', 'SENSITIVITY', 'EXPLICIT_GROUP_INCLUDES_EXACT', '3A', '3A', 'evidex-therapeutic-v1', 'not exact', 'APPROVED', 'reviewer', now()),
          ('assoc_no_fda', 'disease_nsclc', 'variant_l858r', 'drug_no_fda:PRIMARY', 'SENSITIVITY', 'EXACT', '3A', '3A', 'evidex-therapeutic-v1', 'no approval', 'APPROVED', 'reviewer', now()),
          ('assoc_unreviewed', 'disease_nsclc', 'variant_l858r', 'drug_match:PRIMARY', 'EXPLORATORY', 'EXACT', '4', null, 'evidex-therapeutic-v1', 'draft', 'DRAFT', null, null)
      `;
      await transaction`
        insert into therapeutic_association_drug (
          association_id, drug_id, role, sort_order
        ) values
          ('assoc_direct', 'drug_match', 'PRIMARY', 0),
          ('assoc_cross', 'drug_other', 'PRIMARY', 0),
          ('assoc_cross_group', 'drug_match', 'PRIMARY', 0),
          ('assoc_no_fda', 'drug_no_fda', 'PRIMARY', 0),
          ('assoc_unreviewed', 'drug_match', 'PRIMARY', 0)
      `;
      await transaction`
        insert into evidence_claim (
          id, association_id, claim_type, evidence_maturity, study_type,
          population_summary, intervention, endpoint, conclusion,
          limitations, review_status, reviewed_by, reviewed_at
        ) values
          ('claim_direct', 'assoc_direct', 'EFFICACY', 'MATURE_CLINICAL', 'trial', 'NSCLC population', 'osimertinib', 'PFS', 'Direct conclusion', 'Direct limitation', 'APPROVED', 'reviewer', now()),
          ('claim_cross', 'assoc_cross', 'EFFICACY', 'MATURE_CLINICAL', 'trial', 'CRC population', 'exampletinib', 'response', 'Cross conclusion', 'Cross limitation', 'APPROVED', 'reviewer', now()),
          ('claim_cross_group', 'assoc_cross_group', 'EFFICACY', 'MATURE_CLINICAL', 'trial', 'CRC population', 'osimertinib', 'response', 'Grouped conclusion', 'Grouped limitation', 'APPROVED', 'reviewer', now()),
          ('claim_no_fda', 'assoc_no_fda', 'EFFICACY', 'MATURE_CLINICAL', 'trial', 'NSCLC population', 'unapprovedtinib', 'PFS', 'No FDA conclusion', 'No FDA limitation', 'APPROVED', 'reviewer', now())
      `;
      await transaction`
        insert into evidence_claim_passage (
          evidence_claim_id, source_passage_id, support_role
        ) values
          ('claim_direct', 'passage_direct', 'PRIMARY'),
          ('claim_cross', 'passage_cross', 'PRIMARY'),
          ('claim_cross_group', 'passage_cross', 'PRIMARY'),
          ('claim_no_fda', 'passage_direct', 'PRIMARY')
      `;
      await transaction`
        insert into regulatory_approval (
          id, authority, application_number, approval_status, approval_date,
          status_as_of, indication_text, biomarker_text, source_document_id,
          review_status, reviewed_by, reviewed_at
        ) values
          ('approval_match', 'FDA', 'FDA-MATCH', 'APPROVED', '2015-11-13', '2026-09-01', 'NSCLC indication', 'EGFR L858R', 'doc_fda_match', 'APPROVED', 'reviewer', now()),
          ('approval_other', 'FDA', 'FDA-OTHER', 'APPROVED', '2020-01-01', '2026-09-01', 'CRC indication', null, 'doc_fda_other', 'APPROVED', 'reviewer', now())
      `;
      await transaction`
        insert into regulatory_approval_drug (regulatory_approval_id, drug_id)
        values ('approval_match', 'drug_match'), ('approval_other', 'drug_other')
      `;
      await transaction`
        insert into regulatory_approval_disease (
          regulatory_approval_id, disease_id, scope
        ) values
          ('approval_match', 'disease_nsclc', 'EXACT'),
          ('approval_other', 'disease_crc', 'EXACT')
      `;
      await transaction`
        insert into regulatory_approval_variant (
          regulatory_approval_id, variant_id, scope
        ) values
          ('approval_match', 'variant_l858r', 'EXACT'),
          ('approval_other', 'variant_l858r', 'GENE_ONLY')
      `;
      await transaction`
        insert into regulatory_approval_passage (
          regulatory_approval_id, source_passage_id, support_role
        ) values
          ('approval_match', 'passage_fda_match', 'INDICATION'),
          ('approval_other', 'passage_fda_other', 'INDICATION')
      `;
      await transaction`
        insert into knowledge_release (
          id, version, status, literature_cutoff_at, regulatory_cutoff_at,
          grading_rule_version, notes
        ) values (
          'release_retrieval', 'v0.3.0', 'DRAFT', '2026-09-01',
          '2026-09-01', 'evidex-therapeutic-v1', 'repository fixture'
        )
      `;
      await transaction`
        insert into knowledge_release_association (
          knowledge_release_id, therapeutic_association_id,
          approved_level, grading_rationale
        ) values
          ('release_retrieval', 'assoc_direct', '1', 'reviewed direct'),
          ('release_retrieval', 'assoc_cross', '3A', 'reviewed cross'),
          ('release_retrieval', 'assoc_cross_group', '3A', 'not exact'),
          ('release_retrieval', 'assoc_no_fda', '3A', 'no approval'),
          ('release_retrieval', 'assoc_unreviewed', '4', 'draft')
      `;
      await transaction`
        insert into knowledge_release_approval (
          knowledge_release_id, regulatory_approval_id
        ) values
          ('release_retrieval', 'approval_match'),
          ('release_retrieval', 'approval_other')
      `;
      await transaction`
        insert into knowledge_release_claim (
          knowledge_release_id, evidence_claim_id
        ) values
          ('release_retrieval', 'claim_direct'),
          ('release_retrieval', 'claim_cross'),
          ('release_retrieval', 'claim_cross_group'),
          ('release_retrieval', 'claim_no_fda')
      `;
      await transaction`
        update knowledge_release
        set status = 'PUBLISHED', published_at = now(), published_by = 'reviewer'
        where id = 'release_retrieval'
      `;
    });

    const database = drizzle(client!);
    const repository = createPostgresEvidenceRepository(database, {
      releaseVersion: 'v0.3.0',
    });
    const release = await repository.getPublishedRelease();
    expect(release).toMatchObject({
      id: 'release_retrieval',
      version: 'v0.3.0',
    });

    const query = {
      disease: 'NSCLC',
      gene: 'EGFR',
      alterationType: 'SNV',
      hgvsp: 'p.L858R',
      canonicalVariantKey: 'EGFR|SNV|p.L858R',
      jurisdiction: 'US',
      locale: 'zh-CN',
    } as const;
    const first = await repository.retrieveEvidence(release!.id, query);
    const second = await repository.retrieveEvidence(release!.id, query);

    expect(second).toEqual(first);
    expect(first.map(({ scope }) => scope)).toEqual([
      'SAME_DISEASE',
      'CROSS_INDICATION_EXACT_VARIANT',
    ]);
    expect(first[0].therapies).toHaveLength(1);
    expect(first[0].therapies[0]).toMatchObject({
      associationId: 'assoc_direct',
      approvedLevel: '1',
      regulatoryAlignment: 'MATCHED_INDICATION',
      evidenceClaims: [
        {
          id: 'claim_direct',
          populationSummary: 'NSCLC population',
          passages: [
            {
              id: 'passage_direct',
              modelUsePolicy: 'ALLOWED',
              source: { externalId: '11111111' },
            },
          ],
        },
      ],
    });
    expect(first[1].therapies).toHaveLength(1);
    expect(first[1].therapies[0]).toMatchObject({
      associationId: 'assoc_cross',
      approvedLevel: '3B',
      sourceApprovedLevel: '3A',
      regulatoryAlignment: 'OTHER_INDICATION',
    });

    await client!`
      insert into evidence_claim (
        id, association_id, claim_type, evidence_maturity, study_type,
        population_summary, intervention, endpoint, conclusion,
        limitations, review_status, reviewed_by, reviewed_at
      ) values (
        'claim_unreleased', 'assoc_direct', 'EFFICACY', 'MATURE_CLINICAL',
        'later trial', 'later NSCLC population', 'osimertinib', 'PFS',
        'This claim belongs only to a future release.', 'Later evidence.',
        'APPROVED', 'reviewer', now()
      )
    `;
    await client!`
      insert into evidence_claim_passage (
        evidence_claim_id, source_passage_id, support_role
      ) values ('claim_unreleased', 'passage_direct', 'PRIMARY')
    `;

    const unchangedOldRelease = await repository.retrieveEvidence(
      release!.id,
      query
    );
    expect(
      unchangedOldRelease[0].therapies[0].evidenceClaims.map(({ id }) => id)
    ).toEqual(['claim_direct']);
  }, 120_000);

  it('persists and reuses a validated answer snapshot by the full cache key', async () => {
    const repository = createPostgresEvidenceRepository(drizzle(client!), {
      releaseVersion: 'v-retrieval',
    });
    const key = {
      requestFingerprint: 'fingerprint',
      knowledgeReleaseId: 'release_retrieval',
      promptVersion: 'evidex-answer-v1',
      provider: 'openrouter',
      model: 'test-model',
      locale: 'zh-CN' as const,
    };
    await repository.saveAnswerSnapshot({
      ...key,
      evidenceIds: ['claim_direct'],
      associationIds: ['assoc_direct'],
      regulatoryApprovalIds: ['approval_match'],
      structuredOutput: {
        overallSummary: 'cached',
        groups: [],
        overallLimitations: [],
      },
      validationStatus: 'VALID',
      latencyMs: 12,
      createdAt: '2026-09-09T00:00:00.000Z',
    });

    expect(await repository.findAnswerSnapshot(key)).toEqual({
      structuredOutput: {
        overallSummary: 'cached',
        groups: [],
        overallLimitations: [],
      },
      createdAt: '2026-09-09T00:00:00.000Z',
    });
  });

  it('persists a PubMed draft, publishes one idempotent patch release, and keeps the old release isolated', async () => {
    const database = drizzle(client!);
    const upstreamRepository =
      createPostgresUpstreamWorkflowRepository(database);
    const submitted = await submitPubmedCandidate({
      source: {
        pmid: '33333333',
        title: 'New evidence for the existing association',
        abstract: 'A later study reported an efficacy endpoint.',
        doi: '10.1000/new-evidence',
        documentHash: 'hash-new-evidence-document',
        publicationDate: '2026-09-15',
        journal: 'Evidence Journal',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33333333/',
      },
      draft: {
        associationId: 'assoc_direct',
        proposedLevel: '1',
        gradingRationale: 'Level remains unchanged; new claim requires review.',
        passages: [
          {
            id: 'passage_new_primary',
            text: 'The study reported its primary efficacy endpoint.',
            textHash: 'hash-new-primary-passage',
            section: 'Abstract',
            paragraphIndex: 0,
            displayPolicy: 'EXCERPT',
            modelUsePolicy: 'ALLOWED',
            supportRole: 'PRIMARY',
          },
        ],
        claims: [
          {
            id: 'claim_new_release',
            claimType: 'EFFICACY',
            evidenceMaturity: 'MATURE_CLINICAL',
            studyType: 'prospective trial',
            studyName: 'New study',
            populationSummary: 'Advanced NSCLC with EGFR p.L858R',
            sampleSize: 80,
            diseaseStage: 'advanced',
            treatmentLine: 'first-line',
            priorTherapy: 'none',
            intervention: 'osimertinib',
            comparator: 'control',
            endpoint: 'PFS',
            effectValue: { hazardRatio: 0.6 },
            conclusion: 'The study reported longer PFS.',
            limitations: 'Single study.',
            passageIds: ['passage_new_primary'],
          },
        ],
        fieldProvenance: {
          'claims.0.endpoint': ['passage_new_primary'],
        },
        qaIssues: [],
      },
      repository: upstreamRepository,
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
      skillVersions: ['extract_evidence_claims@1.0.0'],
      createId: (() => {
        const ids = [
          'candidate-new',
          'workflow-new',
          'draft-new',
          'review-new',
        ];
        return () => ids.shift()!;
      })(),
    });
    expect(submitted).toMatchObject({
      candidateId: 'candidate-new',
      reviewTaskId: 'review-new',
      draftVersion: 1,
      status: 'READY_FOR_REVIEW',
    });

    const operations = createPostgresOperationsRepository(database);
    const updatedDraft = await operations.updateReviewDraft({
      reviewTaskId: 'review-new',
      expectedDraftVersion: 1,
      draft: {
        associationId: 'assoc_direct',
        proposedLevel: '3A',
        gradingRationale: 'Reviewer confirmed the level and evidence fields.',
        passages: [
          {
            id: 'passage_new_primary',
            text: 'The study reported its primary efficacy endpoint.',
            textHash: 'hash-new-primary-passage',
            section: 'Abstract',
            paragraphIndex: 0,
            displayPolicy: 'EXCERPT',
            modelUsePolicy: 'ALLOWED',
            supportRole: 'PRIMARY',
          },
        ],
        claims: [
          {
            id: 'claim_new_release',
            claimType: 'EFFICACY',
            evidenceMaturity: 'MATURE_CLINICAL',
            studyType: 'prospective trial',
            studyName: 'New study',
            populationSummary: 'Advanced NSCLC with EGFR p.L858R',
            sampleSize: 80,
            diseaseStage: 'advanced',
            treatmentLine: 'first-line',
            priorTherapy: 'none',
            intervention: 'osimertinib',
            comparator: 'control',
            endpoint: 'PFS',
            effectValue: { hazardRatio: 0.6 },
            conclusion: 'The study reported longer PFS.',
            limitations: 'Single study.',
            passageIds: ['passage_new_primary'],
          },
        ],
        fieldProvenance: {
          'claims.0.endpoint': ['passage_new_primary'],
        },
        qaIssues: [],
      },
      reason: 'Checked the draft against the source abstract.',
      actorId: 'reviewer-session-user',
    });
    expect(updatedDraft).toMatchObject({
      reviewTaskId: 'review-new',
      draftVersion: 2,
      status: 'READY_FOR_REVIEW',
    });
    const currentReview =
      await createPostgresReviewPublishRepository(database).getReviewTask(
        'review-new'
      );
    expect(currentReview?.publicationPreview).toEqual({
      currentApprovedLevel: '1',
      currentGradingRationale: 'reviewed direct',
      proposedApprovedLevel: '3A',
      proposedGradingRationale:
        'Reviewer confirmed the level and evidence fields.',
      levelChanged: true,
      newClaimCount: 1,
      modifiedClaimCount: 0,
      source: {
        sourceType: 'PUBMED',
        externalId: '33333333',
        sourceScope: 'ABSTRACT',
      },
      currentRelease: { id: 'release_retrieval', version: 'v0.3.0' },
      expectedNextRelease: 'v0.3.1',
    });
    await expect(
      operations.updateReviewDraft({
        reviewTaskId: 'review-new',
        expectedDraftVersion: 1,
        draft: currentReview!.draft,
        reason: 'Stale browser tab.',
        actorId: 'reviewer-session-user',
      })
    ).rejects.toMatchObject({ code: 'DRAFT_VERSION_CONFLICT', status: 409 });

    const duplicate = await submitPubmedCandidate({
      source: {
        pmid: '44444444',
        title: 'Duplicate DOI',
        abstract: 'The same article discovered through another strategy.',
        doi: 'HTTPS://DOI.ORG/10.1000/NEW-EVIDENCE',
        documentHash: 'another-hash',
        url: 'https://pubmed.ncbi.nlm.nih.gov/44444444/',
      },
      draft: {
        associationId: 'assoc_direct',
        proposedLevel: '1',
        gradingRationale: 'Duplicate draft.',
        passages: [
          {
            id: 'duplicate-passage',
            text: 'Duplicate.',
            textHash: 'duplicate-passage-hash',
            section: 'Abstract',
            paragraphIndex: 0,
            displayPolicy: 'EXCERPT',
            modelUsePolicy: 'ALLOWED',
            supportRole: 'PRIMARY',
          },
        ],
        claims: [
          {
            id: 'duplicate-claim',
            claimType: 'OTHER',
            evidenceMaturity: 'INSUFFICIENT',
            studyType: 'unknown',
            studyName: null,
            populationSummary: 'unknown',
            sampleSize: null,
            diseaseStage: null,
            treatmentLine: null,
            priorTherapy: null,
            intervention: 'unknown',
            comparator: null,
            endpoint: 'unknown',
            effectValue: null,
            conclusion: 'duplicate',
            limitations: 'duplicate',
            passageIds: ['duplicate-passage'],
          },
        ],
        fieldProvenance: { source: ['duplicate-passage'] },
        qaIssues: [],
      },
      repository: upstreamRepository,
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
      skillVersions: [],
    });
    expect(duplicate).toMatchObject({
      candidateId: 'candidate-new',
      duplicate: true,
    });

    const latestReleaseRows = await client!`
      select max(published_at) as published_at
      from knowledge_release
      where status = 'PUBLISHED'
    `;
    const nextPublishedAt = new Date(
      new Date(latestReleaseRows[0].published_at).getTime() + 1_000
    );
    const idValues = [
      'release-patch',
      'decision-patch',
      'change-set-patch',
      'workflow-step-publish',
    ];
    const reviewRepository = createPostgresReviewPublishRepository(database, {
      now: () => nextPublishedAt,
      createId: () => idValues.shift()!,
    });
    const publishInput = {
      reviewTaskId: 'review-new',
      decision: 'APPROVE_AND_PUBLISH' as const,
      expectedDraftVersion: 2,
      actorId: 'reviewer-session-user',
      comment: 'Compared every field with the PubMed abstract.',
      repository: reviewRepository,
    };
    const concurrent = await Promise.allSettled([
      decideReviewTask({
        ...publishInput,
        idempotencyKey: 'review-new:2:approve:a',
      }),
      decideReviewTask({
        ...publishInput,
        idempotencyKey: 'review-new:2:approve:b',
      }),
    ]);
    const successes = concurrent.filter(
      (
        result
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof decideReviewTask>>
      > => result.status === 'fulfilled'
    );
    const conflicts = concurrent.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toMatchObject({
      code: 'INVALID_REVIEW_STATE',
    });
    const decision = successes[0].value;
    expect(decision).toMatchObject({
      status: 'PUBLISHED',
      releaseVersion: 'v0.3.1',
      idempotent: false,
    });
    const publishedReleaseId = decision.releaseId;
    if (!publishedReleaseId) throw new Error('Published release ID is missing');
    const winningKey =
      concurrent[0].status === 'fulfilled'
        ? 'review-new:2:approve:a'
        : 'review-new:2:approve:b';

    await expect(
      decideReviewTask({
        ...publishInput,
        comment: 'Repeated request.',
        idempotencyKey: winningKey,
      })
    ).resolves.toMatchObject({
      releaseId: publishedReleaseId,
      releaseVersion: 'v0.3.1',
      idempotent: true,
    });
    expect(
      await client!`
        select count(*)::int as count
        from knowledge_release
        where version = 'v0.3.1'
      `
    ).toEqual([{ count: 1 }]);

    const query = {
      disease: 'NSCLC',
      gene: 'EGFR',
      alterationType: 'SNV',
      hgvsp: 'p.L858R',
      canonicalVariantKey: 'EGFR|SNV|p.L858R',
      jurisdiction: 'US',
      locale: 'zh-CN',
    } as const;
    const oldRepository = createPostgresEvidenceRepository(database, {
      releaseVersion: 'v0.3.0',
    });
    const latestRepository = createPostgresEvidenceRepository(database);
    const oldGroups = await oldRepository.retrieveEvidence(
      (await oldRepository.getPublishedRelease())!.id,
      query
    );
    const latestGroups = await latestRepository.retrieveEvidence(
      (await latestRepository.getPublishedRelease())!.id,
      query
    );
    expect(
      oldGroups[0].therapies[0].evidenceClaims.map(({ id }) => id)
    ).toEqual(['claim_direct']);
    expect(oldGroups[0].therapies[0]).toMatchObject({
      approvedLevel: '1',
      gradingRationale: 'reviewed direct',
    });
    expect(
      latestGroups[0].therapies[0].evidenceClaims.map(({ id }) => id)
    ).toEqual(['claim_direct', 'claim_new_release']);
    expect(latestGroups[0].therapies[0]).toMatchObject({
      approvedLevel: '3A',
      gradingRationale: 'Reviewer confirmed the level and evidence fields.',
    });

    const catalog = createPostgresKnowledgeCatalogRepository(database);
    const search = await searchKnowledge({
      repository: catalog,
      query: 'L858R',
      type: 'variant',
    });
    expect(search).toMatchObject({
      release: { version: 'v0.3.1' },
      items: [
        {
          id: 'variant_l858r',
          type: 'variant',
          canonicalName: 'EGFR p.L858R',
        },
      ],
    });
    const diseaseDetail = await catalog.getEntityDetail({
      releaseId: publishedReleaseId,
      type: 'disease',
      id: 'disease_nsclc',
    });
    expect(diseaseDetail).toMatchObject({
      entity: { id: 'disease_nsclc', type: 'disease' },
      associations: [
        expect.objectContaining({
          id: 'assoc_direct',
          approvedLevel: '3A',
          gradingRationale: 'Reviewer confirmed the level and evidence fields.',
          claimCount: 2,
        }),
      ],
    });
    const oldDiseaseDetail = await catalog.getEntityDetail({
      releaseId: 'release_retrieval',
      type: 'disease',
      id: 'disease_nsclc',
    });
    expect(oldDiseaseDetail).toMatchObject({
      associations: [
        expect.objectContaining({
          id: 'assoc_direct',
          approvedLevel: '1',
          gradingRationale: 'reviewed direct',
        }),
      ],
    });
    const releaseDiff = await operations.getRelease(publishedReleaseId);
    expect(releaseDiff).toMatchObject({
      members: {
        associationSnapshots: expect.arrayContaining([
          {
            associationId: 'assoc_direct',
            approvedLevel: '3A',
            gradingRationale:
              'Reviewer confirmed the level and evidence fields.',
          },
        ]),
      },
    });

    const unpublishedDraft = (suffix: string) => ({
      associationId: 'assoc_direct',
      proposedLevel: '4',
      gradingRationale: `Unpublished ${suffix} rationale.`,
      passages: [
        {
          id: `passage_${suffix}`,
          text: `Unpublished ${suffix} passage.`,
          textHash: `hash-passage-${suffix}`,
          section: 'Abstract',
          paragraphIndex: 0,
          displayPolicy: 'EXCERPT' as const,
          modelUsePolicy: 'ALLOWED' as const,
          supportRole: 'PRIMARY' as const,
        },
      ],
      claims: [
        {
          id: `claim_${suffix}`,
          claimType: 'OTHER' as const,
          evidenceMaturity: 'INSUFFICIENT' as const,
          studyType: 'unpublished test',
          studyName: null,
          populationSummary: 'Unpublished test population',
          sampleSize: null,
          diseaseStage: null,
          treatmentLine: null,
          priorTherapy: null,
          intervention: 'test intervention',
          comparator: null,
          endpoint: 'test endpoint',
          effectValue: null,
          conclusion: `Unpublished ${suffix} conclusion.`,
          limitations: 'Not approved.',
          passageIds: [`passage_${suffix}`],
        },
      ],
      fieldProvenance: { source: [`passage_${suffix}`] },
      qaIssues: [],
    });
    for (const pendingDecision of [
      {
        suffix: 'returned',
        pmid: '85555555',
        decision: 'REQUEST_CHANGES' as const,
        requestedFields: ['claims.0.endpoint'],
        comment: 'Please correct the endpoint.',
      },
      {
        suffix: 'rejected',
        pmid: '86666666',
        decision: 'REJECT' as const,
        requestedFields: [],
        comment: 'The source does not support the claim.',
      },
    ]) {
      const ids = [
        `candidate-${pendingDecision.suffix}`,
        `workflow-${pendingDecision.suffix}`,
        `draft-${pendingDecision.suffix}`,
        `review-${pendingDecision.suffix}`,
      ];
      const staged = await submitPubmedCandidate({
        source: {
          pmid: pendingDecision.pmid,
          title: `Unpublished ${pendingDecision.suffix} evidence`,
          abstract: 'This record must remain outside public knowledge.',
          documentHash: `hash-document-${pendingDecision.suffix}`,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pendingDecision.pmid}/`,
        },
        draft: unpublishedDraft(pendingDecision.suffix),
        repository: upstreamRepository,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
        createId: () => ids.shift()!,
      });
      await decideReviewTask({
        reviewTaskId: staged.reviewTaskId!,
        decision: pendingDecision.decision,
        expectedDraftVersion: 1,
        actorId: 'reviewer-session-user',
        comment: pendingDecision.comment,
        requestedFields: pendingDecision.requestedFields,
        idempotencyKey: `${staged.reviewTaskId}:1:${pendingDecision.decision}`,
        repository: createPostgresReviewPublishRepository(database),
      });
    }
    expect(
      await client!`
        select count(*)::int as count
        from source_document
        where external_id in ('85555555', '86666666')
      `
    ).toEqual([{ count: 0 }]);
    expect(
      await client!`
        select status
        from review_task
        where id in ('review-returned', 'review-rejected')
        order by id
      `
    ).toEqual([{ status: 'REJECTED' }, { status: 'REQUESTED_CHANGES' }]);

    const rollbackIds = [
      'candidate-rollback',
      'workflow-rollback',
      'draft-rollback',
      'review-rollback',
    ];
    const rollbackDraft = unpublishedDraft('rollback');
    rollbackDraft.claims[0].id = 'claim_direct';
    const rollbackCandidate = await submitPubmedCandidate({
      source: {
        pmid: '87777777',
        title: 'Transaction rollback evidence',
        abstract: 'A forced duplicate claim must roll back all formal writes.',
        documentHash: 'hash-document-rollback',
        url: 'https://pubmed.ncbi.nlm.nih.gov/87777777/',
      },
      draft: rollbackDraft,
      repository: upstreamRepository,
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
      skillVersions: [],
      createId: () => rollbackIds.shift()!,
    });
    const publishRollbackIds = [
      'release-rollback',
      'decision-rollback',
      'change-set-rollback',
    ];
    await expect(
      decideReviewTask({
        reviewTaskId: rollbackCandidate.reviewTaskId!,
        decision: 'APPROVE_AND_PUBLISH',
        expectedDraftVersion: 1,
        actorId: 'reviewer-session-user',
        comment: 'Force the duplicate-claim rollback path.',
        idempotencyKey: 'review-rollback:1:approve',
        repository: createPostgresReviewPublishRepository(database, {
          createId: () => publishRollbackIds.shift()!,
        }),
      })
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(
      await client!`
        select
          exists(select 1 from knowledge_release where id = 'release-rollback') as release_exists,
          exists(select 1 from source_document where external_id = '87777777') as source_exists,
          exists(select 1 from source_passage where id = 'passage_rollback') as passage_exists,
          exists(select 1 from knowledge_change_set where id = 'change-set-rollback') as change_set_exists,
          exists(select 1 from review_decision where idempotency_key = 'review-rollback:1:approve') as decision_exists
      `
    ).toEqual([
      {
        release_exists: false,
        source_exists: false,
        passage_exists: false,
        change_set_exists: false,
        decision_exists: false,
      },
    ]);
    expect(
      await client!`
        select status
        from review_task
        where id = 'review-rollback'
      `
    ).toEqual([{ status: 'READY_FOR_REVIEW' }]);
    const evidenceDetail = await catalog.getEvidenceDetail({
      releaseId: publishedReleaseId,
      id: 'claim_direct',
    });
    expect(evidenceDetail).toMatchObject({
      claim: { id: 'claim_direct', conclusion: 'Direct conclusion' },
      association: { id: 'assoc_direct' },
      passages: [
        expect.objectContaining({
          id: 'passage_direct',
          displayPolicy: 'EXCERPT',
          text: 'Direct excerpt.',
        }),
      ],
    });
    const linkOnlySource = await catalog.getSourceDetail({
      releaseId: publishedReleaseId,
      id: 'doc_pubmed_cross',
    });
    expect(linkOnlySource).toMatchObject({
      source: { id: 'doc_pubmed_cross', externalId: '22222222' },
      passages: [
        expect.objectContaining({
          id: 'passage_cross',
          displayPolicy: 'LINK_ONLY',
        }),
      ],
      evidenceClaimIds: ['claim_cross', 'claim_cross_group'],
    });
    expect(linkOnlySource?.passages[0]).not.toHaveProperty('text');
  }, 240_000);

  it('persists a release-locked question run and returns no curated evidence without model work', async () => {
    const database = drizzle(client!);
    const repository = createPostgresQuestionRunRepository(database);
    const generator = { generate: vi.fn() };
    const dependencies = {
      repository,
      createId: () => 'question-run-database',
      now: () => new Date('2026-09-16T02:00:00.000Z'),
      getAnswerDependencies: (releaseVersion: string, interpretation: any) => {
        const evidenceRepository = createPostgresEvidenceRepository(database, {
          releaseVersion,
        });
        const drugs =
          interpretation?.status === 'RESOLVED' ? interpretation.drugs : [];
        return {
          repository: {
            ...evidenceRepository,
            async retrieveEvidence(releaseId: string, query: any) {
              const groups = await evidenceRepository.retrieveEvidence(
                releaseId,
                query
              );
              return groups.map((group) => ({
                ...group,
                therapies: group.therapies.filter((therapy) =>
                  drugs.length
                    ? therapy.drugs.some((item) =>
                        drugs.includes(item.genericName.toLowerCase())
                      )
                    : true
                ),
              }));
            },
          },
          generator,
          promptVersion: 'evidex-answer-v1',
          provider: 'evolink',
          model: 'gpt-5.6-terra',
          normalizedQuery:
            interpretation?.status === 'RESOLVED'
              ? interpretation.normalizedQuery
              : undefined,
          now: () => new Date('2026-09-16T02:00:01.000Z'),
        };
      },
    };
    const submitted = await submitEvidenceQuestion({
      value: {
        question: 'NSCLC 的 EGFR p.L858R 中 unapprovedtinib 有哪些治疗证据？',
        locale: 'zh-CN',
      },
      idempotencyKey: 'database-question-1',
      dependencies,
    });
    expect(submitted).toMatchObject({
      status: 'PENDING',
      knowledgeRelease: { version: 'v0.3.1' },
    });
    expect(
      await client!`
        select count(*)::int as count
        from platform_job
        where job_type = 'QUESTION_RUN'
          and resource_id = ${submitted.id}
          and status = 'QUEUED'
      `
    ).toEqual([{ count: 1 }]);
    expect(
      await client!`
        select wr.kind, wr.status, wsr.step_key
        from question_run qr
        join workflow_run wr on wr.id = qr.workflow_run_id
        join workflow_step_run wsr on wsr.workflow_run_id = wr.id
        where qr.id = ${submitted.id}
      `
    ).toEqual([
      {
        kind: 'DOWNSTREAM',
        status: 'PENDING',
        step_key: 'understand_question',
      },
    ]);

    let completed: Awaited<ReturnType<typeof processEvidenceQuestionRun>> =
      null;
    await expect(
      processNextPlatformJob({
        repository: createPostgresDiscoveryRunRepository(database),
        workerId: 'database-question-worker',
        handlers: {
          DISCOVERY_RUN: vi.fn(),
          CANDIDATE_RETRY: vi.fn(),
          QUESTION_RUN: async (job) => {
            completed = await processEvidenceQuestionRun({
              questionRunId: job.resourceId,
              resumeExisting: true,
              dependencies,
            });
          },
        },
      })
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(completed).toMatchObject({
      status: 'NO_CURATED_EVIDENCE',
      publicResult: {
        status: 'NO_CURATED_EVIDENCE',
        knowledge: { release: 'v0.3.1' },
      },
    });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(
      await client!`
        select wr.status, wr.current_step,
          array_agg(wsr.step_key order by wsr.step_key) as steps
        from question_run qr
        join workflow_run wr on wr.id = qr.workflow_run_id
        join workflow_step_run wsr on wsr.workflow_run_id = wr.id
        where qr.id = ${submitted.id}
        group by wr.status, wr.current_step
      `
    ).toEqual([
      {
        status: 'SUCCEEDED',
        current_step: 'completed',
        steps: [
          'analyze_evidence',
          'build_evidence_pack',
          'build_retrieval_plan',
          'normalize_query',
          'understand_question',
        ],
      },
    ]);
    await expect(
      repository.findByIdempotencyKey('database-question-1')
    ).resolves.toMatchObject({
      id: 'question-run-database',
      status: 'NO_CURATED_EVIDENCE',
    });

    const firstFeedback = await createQuestionFeedback({
      questionRunId: submitted.id,
      value: { category: 'HELPFUL', comment: 'Clear release metadata.' },
      idempotencyKey: 'database-feedback-1',
      dependencies,
    });
    const repeatedFeedback = await createQuestionFeedback({
      questionRunId: submitted.id,
      value: { category: 'HELPFUL', comment: 'Ignored on replay.' },
      idempotencyKey: 'database-feedback-1',
      dependencies,
    });
    expect(firstFeedback).toMatchObject({
      questionRunId: submitted.id,
      knowledgeRelease: 'v0.3.1',
      category: 'HELPFUL',
      idempotent: false,
    });
    expect(repeatedFeedback).toMatchObject({
      id: firstFeedback.id,
      idempotent: true,
    });

    let concurrentId = 0;
    const concurrentDependencies = {
      ...dependencies,
      createId: () => `question-run-concurrent-${++concurrentId}`,
    };
    const concurrentInput = {
      value: {
        question: 'NSCLC 的 EGFR p.L858R 有哪些治疗证据？',
        locale: 'zh-CN' as const,
      },
      idempotencyKey: 'database-question-concurrent',
      dependencies: concurrentDependencies,
    };
    const [concurrentFirst, concurrentSecond] = await Promise.all([
      submitEvidenceQuestion(concurrentInput),
      submitEvidenceQuestion(concurrentInput),
    ]);
    expect(concurrentSecond.id).toBe(concurrentFirst.id);
    await client!`
      update platform_job
      set status = 'SUCCEEDED', completed_at = now()
      where job_type = 'QUESTION_RUN' and status = 'QUEUED'
    `;
    await client!`
      update question_run
      set status = 'FAILED', error_code = 'MODEL_UNAVAILABLE',
          public_result = '{"status":"FAILED"}'::jsonb, completed_at = now()
      where id = ${concurrentFirst.id}
    `;
    await client!`
      update workflow_run
      set status = 'FAILED', current_step = 'completed',
          error_code = 'MODEL_UNAVAILABLE', completed_at = now()
      where id = (
        select workflow_run_id from question_run where id = ${concurrentFirst.id}
      )
    `;
    await client!`
      update platform_job
      set status = 'DEAD_LETTER', attempts = max_attempts,
          last_error_code = 'MODEL_UNAVAILABLE', completed_at = now()
      where job_type = 'QUESTION_RUN' and resource_id = ${concurrentFirst.id}
    `;
    await expect(
      retryEvidenceQuestionRun({
        questionRunId: concurrentFirst.id,
        dependencies: concurrentDependencies,
      })
    ).resolves.toMatchObject({ status: 'PENDING', requeued: true });
    await expect(
      retryEvidenceQuestionRun({
        questionRunId: concurrentFirst.id,
        dependencies: concurrentDependencies,
      })
    ).resolves.toMatchObject({ status: 'PENDING', requeued: false });
    expect(
      await client!`
        select qr.status, wr.status as workflow_status, pj.status as job_status,
          pj.attempts, pj.last_error_code
        from question_run qr
        join workflow_run wr on wr.id = qr.workflow_run_id
        join platform_job pj on pj.job_type = 'QUESTION_RUN'
          and pj.resource_id = qr.id
        where qr.id = ${concurrentFirst.id}
      `
    ).toEqual([
      {
        status: 'PENDING',
        workflow_status: 'PENDING',
        job_status: 'QUEUED',
        attempts: 0,
        last_error_code: null,
      },
    ]);
  }, 120_000);

  it('creates one idempotent Discovery Run for the same strategy window', async () => {
    await client!`
      insert into discovery_strategy (
        id, name, version, query, association_id, status, overlap_days, max_results
      ) values (
        'strategy_database', 'NSCLC EGFR L858R', '1.0.0', 'EGFR AND L858R',
        'assoc_direct', 'ACTIVE', 2, 50
      )
    `;
    const operations = createPostgresOperationsRepository(drizzle(client!), {
      createId: () => 'discovery-run-database',
      now: () => new Date('2026-09-16T03:00:00.000Z'),
    });
    const input = {
      strategyId: 'strategy_database',
      actorId: 'reviewer-session-user',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-16T00:00:00.000Z',
      repository: operations,
      workflowVersion: 'pubmed-discovery-v1',
    };
    const first = await triggerDiscoveryRun(input);
    const repeated = await triggerDiscoveryRun(input);
    expect(first).toMatchObject({
      idempotent: false,
      run: { id: 'discovery-run-database', status: 'PENDING' },
    });
    expect(repeated).toMatchObject({
      idempotent: true,
      run: { id: 'discovery-run-database' },
    });
    expect(
      await client!`
        select count(*)::int as count
        from discovery_run
        where strategy_id = 'strategy_database'
      `
    ).toEqual([{ count: 1 }]);
  }, 60_000);

  it('persists scoped Discovery Runs and recoverable worker jobs', async () => {
    await client!`
      insert into discovery_strategy (
        id, name, version, query, association_id, status, overlap_days, max_results
      ) values (
        'strategy_database_second', 'NSCLC EGFR second query', '1.0.0',
        'EGFR AND second query', 'assoc_cross', 'ACTIVE', 2, 50
      )
    `;
    let sequence = 0;
    const repository = createPostgresDiscoveryRunRepository(drizzle(client!), {
      createId: () => `persistent-${++sequence}`,
      now: () => new Date('2026-09-16T04:00:00.000Z'),
    });
    const preview = {
      snapshot: {
        mode: 'SCOPED' as const,
        diseaseIds: ['disease_nsclc'],
        geneIds: ['gene_egfr'],
        variantIds: ['variant_l858r'],
        aliasVersion: 'catalog-v1',
        knowledgeReleaseId: 'release_v031',
        knowledgeReleaseVersion: 'v0.3.1',
      },
      documentLimit: 50 as const,
      window: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-16T00:00:00.000Z',
      },
      queries: [
        {
          strategyId: 'strategy_database',
          strategyVersion: '1.0.0',
          associationId: 'assoc_direct',
          query: 'EGFR AND L858R',
          label: 'NSCLC EGFR L858R',
          estimatedMatchCount: 12,
        },
        {
          strategyId: 'strategy_database_second',
          strategyVersion: '1.0.0',
          associationId: 'assoc_cross',
          query: 'EGFR AND second query',
          label: 'NSCLC EGFR second query',
          estimatedMatchCount: 7,
        },
      ],
      estimatedMatchCount: 19,
      warnings: [],
      previewHash: 'preview-persistent-database',
      expiresAt: '2026-09-16T04:15:00.000Z',
    };
    const created = await repository.createManualDiscoveryRun({
      actorId: 'operator-database',
      idempotencyKey: 'client-request-1',
      preview,
      workflowVersion: 'pubmed-discovery-v2',
    });
    const replayed = await repository.createManualDiscoveryRun({
      actorId: 'operator-database',
      idempotencyKey: 'client-request-2',
      preview,
      workflowVersion: 'pubmed-discovery-v2',
    });
    expect(created).toMatchObject({
      idempotent: false,
      run: {
        scopeMode: 'SCOPED',
        documentLimit: 50,
        estimatedMatchCount: 19,
      },
    });
    expect(replayed).toMatchObject({
      idempotent: true,
      run: { id: (created.run as { id: string }).id },
    });

    const runId = (created.run as { id: string }).id;
    await client!`
      insert into candidate_document (
        id, source_type, external_id, document_hash, title, abstract,
        source_url, matched_strategy_ids, status, created_at
      ) values
        (
          'candidate-run-first', 'PUBMED', '66000001', 'hash-run-first',
          'First query candidate', 'First query abstract.',
          'https://pubmed.ncbi.nlm.nih.gov/66000001/',
          '["strategy_database"]'::jsonb, 'READY_FOR_REVIEW',
          '2026-09-10T00:00:00.000Z'
        ),
        (
          'candidate-run-second', 'PUBMED', '66000002', 'hash-run-second',
          'Second query candidate', 'Second query abstract.',
          'https://pubmed.ncbi.nlm.nih.gov/66000002/',
          '["strategy_database_second"]'::jsonb, 'READY_FOR_REVIEW',
          '2026-09-11T00:00:00.000Z'
        ),
        (
          'candidate-run-unrelated', 'PUBMED', '66000003', 'hash-run-unrelated',
          'Unrelated run candidate', 'Unrelated run abstract.',
          'https://pubmed.ncbi.nlm.nih.gov/66000003/',
          '["strategy_database"]'::jsonb, 'READY_FOR_REVIEW',
          '2026-09-12T00:00:00.000Z'
        )
    `;
    await client!`
      insert into discovery_run_document (
        id, discovery_run_id, external_id, matched_strategy_ids,
        status, candidate_document_id
      ) values
        (
          'run-document-first', ${runId}, '66000001',
          '["strategy_database"]'::jsonb, 'READY_FOR_REVIEW',
          'candidate-run-first'
        ),
        (
          'run-document-second', ${runId}, '66000002',
          '["strategy_database_second"]'::jsonb, 'READY_FOR_REVIEW',
          'candidate-run-second'
        )
    `;
    const detail = (await createPostgresOperationsRepository(
      drizzle(client!)
    ).getDiscoveryRun(runId)) as {
      queries: Array<{ strategyId: string }>;
      candidates: Array<{ id: string }>;
    };
    expect(detail.queries.map(({ strategyId }) => strategyId)).toEqual([
      'strategy_database',
      'strategy_database_second',
    ]);
    expect(detail.candidates.map(({ id }) => id).sort()).toEqual([
      'candidate-run-first',
      'candidate-run-second',
    ]);

    const claimed = await repository.claimPlatformJob({
      workerId: 'database-worker',
      lockTimeoutMs: 300_000,
    });
    expect(claimed).toMatchObject({
      jobType: 'DISCOVERY_RUN',
      resourceId: runId,
      attempts: 1,
    });
    await repository.transitionDiscoveryRun({
      runId,
      action: 'pause',
      actorId: 'operator-database',
    });
    expect(
      await client!`
        select status from platform_job where id = ${claimed!.id}
      `
    ).toEqual([{ status: 'PAUSED' }]);
    await repository.transitionDiscoveryRun({
      runId,
      action: 'resume',
      actorId: 'operator-database',
    });
    const reclaimed = await repository.claimPlatformJob({
      workerId: 'database-worker-2',
      lockTimeoutMs: 300_000,
    });
    expect(reclaimed).toMatchObject({ id: claimed!.id, attempts: 2 });
    await repository.transitionDiscoveryRun({
      runId,
      action: 'cancel',
      actorId: 'operator-database',
    });
    expect(
      await client!`
        select status from discovery_run where id = ${runId}
      `
    ).toEqual([{ status: 'CANCELLED' }]);

    const civicPreview = {
      ...preview,
      snapshot: { ...preview.snapshot, source: 'CIVIC' as const },
      queries: [
        {
          ...preview.queries[0],
          query:
            '{"version":1,"diseaseId":"disease_nsclc","variantId":"variant_egfr_l858r","geneSymbol":"EGFR","profileName":"L858R","diseaseName":"Lung Non-small Cell Carcinoma"}',
          label: 'CIViC · NSCLC EGFR L858R',
        },
      ],
      estimatedMatchCount: 1,
      previewHash: 'preview-civic-persistent-database',
    };
    const civicCreated = await repository.createManualDiscoveryRun({
      actorId: 'operator-database',
      idempotencyKey: 'client-civic-request-1',
      preview: civicPreview,
      workflowVersion: 'pubmed-discovery-v2',
    });
    const civicRunId = (civicCreated.run as { id: string }).id;
    await expect(
      repository.beginDiscoveryRun(civicRunId)
    ).resolves.toMatchObject({ run: { source: 'CIVIC' } });
    await repository.recordDiscoveryProvenance!({
      runId: civicRunId,
      externalId: '24868098',
      strategyId: 'strategy_database',
      provenance: {
        source: 'CIVIC',
        retrievedAt: '2026-09-16T04:00:00.000Z',
        query: {
          version: 1,
          diseaseId: 'disease_nsclc',
          variantId: 'variant_egfr_l858r',
          geneSymbol: 'EGFR',
          profileName: 'L858R',
          diseaseName: 'Lung Non-small Cell Carcinoma',
        },
        evidenceItems: [],
      },
    });
    await repository.finishDiscoveryRun({
      runId: civicRunId,
      status: 'SUCCEEDED',
    });
    expect(
      await client!`
        select action, details->>'externalId' as external_id
        from platform_audit_event
        where resource_id = ${civicRunId}
          and action = 'CIVIC_CANDIDATE_DISCOVERED'
      `
    ).toEqual([
      {
        action: 'CIVIC_CANDIDATE_DISCOVERED',
        external_id: '24868098',
      },
    ]);
    expect(
      await client!`
        select last_successful_cutoff_at
        from discovery_strategy
        where id = 'strategy_database'
      `
    ).toEqual([{ last_successful_cutoff_at: null }]);
  }, 60_000);

  it('queues candidate retries durably and fails exhausted discovery runs', async () => {
    await client!`
      insert into workflow_run (
        id, workflow_version_id, workflow_version, kind, idempotency_key,
        status, current_step, input_hash
      ) values (
        'workflow-retry-database', 'single-pubmed-v1', 'single-pubmed-v1',
        'UPSTREAM', 'workflow-retry-database', 'FAILED', 'extract_evidence_claims',
        'workflow-retry-input'
      )
    `;
    await client!`
      insert into candidate_document (
        id, source_type, external_id, document_hash, title, abstract,
        source_url, status, active_workflow_run_id
      ) values (
        'candidate-retry-database', 'PUBMED', '55555555',
        'candidate-retry-document-hash', 'Retry candidate',
        'A candidate requiring durable retry.',
        'https://pubmed.ncbi.nlm.nih.gov/55555555/', 'FAILED',
        'workflow-retry-database'
      )
    `;
    await client!`
      insert into evidence_draft (
        id, candidate_document_id, workflow_run_id, association_id,
        draft_version, status, payload, field_provenance, agent_version,
        skill_versions, proposed_level, grading_rationale, qa_issues
      ) values (
        'draft-retry-database', 'candidate-retry-database',
        'workflow-retry-database', 'assoc_direct', 1, 'DRAFT', '{}', '{}',
        'extraction-agent@1.0.0', '[]', 'UNRATED', 'Retry required.', '[]'
      )
    `;
    await client!`
      insert into review_task (
        id, candidate_document_id, evidence_draft_id, draft_version,
        status, lock_version
      ) values (
        'review-retry-database', 'candidate-retry-database',
        'draft-retry-database', 1, 'PUBLISH_FAILED', 1
      )
    `;

    const operations = createPostgresOperationsRepository(drizzle(client!), {
      createId: () => 'candidate-retry-job-database',
    });
    await expect(
      operations.retryCandidate({
        id: 'candidate-retry-database',
        actorId: 'operator-database',
      })
    ).resolves.toMatchObject({ status: 'QUEUED', accepted: true });
    expect(
      await client!`
        select job_type, resource_id, status, attempts
        from platform_job
        where resource_id = 'candidate-retry-database'
      `
    ).toEqual([
      {
        job_type: 'CANDIDATE_RETRY',
        resource_id: 'candidate-retry-database',
        status: 'QUEUED',
        attempts: 0,
      },
    ]);

    const discoveryRepository = createPostgresDiscoveryRunRepository(
      drizzle(client!),
      {
        now: () => new Date('2026-09-16T05:00:00.000Z'),
      }
    );
    const discoveryJobRows = await client!`
      select resource_id
      from platform_job
      where job_type = 'DISCOVERY_RUN'
      order by created_at desc
      limit 1
    `;
    const deadLetterRunId = discoveryJobRows[0].resource_id as string;
    await client!`
      update platform_job
      set status = 'QUEUED', attempts = 0, max_attempts = 1,
          available_at = '2026-09-16T04:59:00.000Z'
      where job_type = 'DISCOVERY_RUN'
        and resource_id = ${deadLetterRunId}
    `;
    await client!`
      update discovery_run
      set status = 'PENDING', cancelled_at = null, completed_at = null
      where id = ${deadLetterRunId}
    `;
    const claimed = await discoveryRepository.claimPlatformJob({
      workerId: 'dead-letter-worker',
      lockTimeoutMs: 300_000,
    });
    expect(claimed).toMatchObject({
      jobType: 'DISCOVERY_RUN',
      resourceId: deadLetterRunId,
      attempts: 1,
      maxAttempts: 1,
    });
    await expect(
      discoveryRepository.failPlatformJob({
        jobId: claimed!.id,
        errorCode: 'NCBI_UNAVAILABLE',
        errorSummary: 'PubMed remained unavailable.',
      })
    ).resolves.toEqual({ status: 'DEAD_LETTER' });
    expect(
      await client!`
        select status, error_code from discovery_run
        where id = ${deadLetterRunId}
      `
    ).toEqual([{ status: 'FAILED', error_code: 'NCBI_UNAVAILABLE' }]);
  }, 60_000);
});
