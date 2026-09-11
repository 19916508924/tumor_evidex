import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  }, 120_000);

  afterAll(async () => {
    if (client) {
      await client.end();
    }
    await admin.unsafe(`drop schema if exists "${testSchema}" cascade`);
    await admin.end();
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
          'release_retrieval', 'v-retrieval', 'DRAFT', '2026-09-01',
          '2026-09-01', 'evidex-therapeutic-v1', 'repository fixture'
        )
      `;
      await transaction`
        insert into knowledge_release_association (
          knowledge_release_id, therapeutic_association_id
        ) values
          ('release_retrieval', 'assoc_direct'),
          ('release_retrieval', 'assoc_cross'),
          ('release_retrieval', 'assoc_cross_group'),
          ('release_retrieval', 'assoc_no_fda'),
          ('release_retrieval', 'assoc_unreviewed')
      `;
      await transaction`
        insert into knowledge_release_approval (
          knowledge_release_id, regulatory_approval_id
        ) values
          ('release_retrieval', 'approval_match'),
          ('release_retrieval', 'approval_other')
      `;
      await transaction`
        update knowledge_release
        set status = 'PUBLISHED', published_at = now(), published_by = 'reviewer'
        where id = 'release_retrieval'
      `;
    });

    const database = drizzle(client!);
    const repository = createPostgresEvidenceRepository(database, {
      releaseVersion: 'v-retrieval',
    });
    const release = await repository.getPublishedRelease();
    expect(release).toMatchObject({
      id: 'release_retrieval',
      version: 'v-retrieval',
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
  }, 60_000);

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
});
