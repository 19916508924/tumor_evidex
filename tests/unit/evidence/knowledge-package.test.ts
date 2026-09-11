import { describe, expect, it } from 'vitest';

import {
  calculateKnowledgePackageHash,
  validateKnowledgePackage,
  type KnowledgePackageInput,
} from '@/shared/services/evidence/knowledge-package';

function createPackage(): KnowledgePackageInput {
  return {
    entities: {
      diseases: [
        {
          id: 'disease_nsclc_fixture',
          canonicalName: 'NSCLC',
          displayNameZh: '非小细胞肺癌',
          displayNameEn: 'Non-small cell lung cancer',
          ontologySystem: 'NCIt',
          ontologyCode: 'C2926',
          lineage: 'SOLID',
          aliases: ['non-small-cell lung cancer'],
          status: 'ACTIVE',
        },
      ],
      genes: [
        {
          id: 'gene_egfr_fixture',
          symbol: 'EGFR',
          hgncId: 'HGNC:3236',
          name: 'epidermal growth factor receptor',
          aliases: ['ERBB1'],
          status: 'ACTIVE',
        },
      ],
      variants: [
        {
          id: 'variant_egfr_l858r_fixture',
          geneId: 'gene_egfr_fixture',
          alterationType: 'SNV',
          hgvsp: 'p.L858R',
          hgvsc: 'c.2573T>G',
          transcript: 'NM_005228.5',
          canonicalKey: 'EGFR|SNV|p.L858R',
          aliases: ['p.Leu858Arg'],
          status: 'ACTIVE',
        },
      ],
      drugs: [
        {
          id: 'drug_fixturetinib',
          genericName: 'fixturetinib',
          displayNameZh: '测试替尼',
          displayNameEn: 'fixturetinib',
          brandNames: ['FIXTURE'],
          aliases: [],
          externalIds: { fdaApplicationNumber: 'NDA000001' },
          status: 'ACTIVE',
        },
      ],
    },
    publications: [
      {
        id: 'doc_pubmed_fixture',
        sourceType: 'PUBMED',
        externalId: '10000001',
        title: 'Fixture clinical trial',
        publisherOrAgency: 'Fixture publisher',
        journal: 'Fixture Journal',
        publicationDate: '2025-01-01',
        doi: '10.1000/fixture',
        pmcid: null,
        url: 'https://pubmed.ncbi.nlm.nih.gov/10000001/',
        sourceScope: 'ABSTRACT',
        language: 'en',
        license: 'Copyrighted abstract; short excerpt only',
        retrievedAt: '2026-09-10T00:00:00.000Z',
        documentHash: 'doc-hash-pubmed',
        metadata: {},
        reviewStatus: 'APPROVED',
      },
      {
        id: 'doc_fda_fixture',
        sourceType: 'FDA',
        externalId: 'NDA000001-S000',
        title: 'FIXTURE Prescribing Information',
        publisherOrAgency: 'U.S. Food and Drug Administration',
        journal: null,
        publicationDate: '2025-02-01',
        doi: null,
        pmcid: null,
        url: 'https://www.accessdata.fda.gov/fixture.pdf',
        sourceScope: 'FDA_LABEL',
        language: 'en',
        license: 'U.S. government work',
        retrievedAt: '2026-09-10T00:00:00.000Z',
        documentHash: 'doc-hash-fda',
        metadata: {},
        reviewStatus: 'APPROVED',
      },
    ],
    passages: [
      {
        id: 'passage_pubmed_fixture',
        sourceDocumentId: 'doc_pubmed_fixture',
        section: 'Abstract - Results',
        paragraphIndex: 1,
        locator: { PMID: '10000001' },
        originalText: 'Fixture primary evidence excerpt.',
        textHash: 'passage-hash-pubmed',
        language: 'en',
        displayPolicy: 'EXCERPT',
        modelUsePolicy: 'ALLOWED',
        publicExcerpt: 'Fixture primary evidence excerpt.',
        contextBeforeId: null,
        contextAfterId: null,
        reviewStatus: 'APPROVED',
      },
      {
        id: 'passage_fda_fixture',
        sourceDocumentId: 'doc_fda_fixture',
        section: '1 INDICATIONS AND USAGE',
        paragraphIndex: 1,
        locator: { section: '1' },
        originalText:
          'Fixturetinib is indicated for EGFR L858R metastatic NSCLC.',
        textHash: 'passage-hash-fda',
        language: 'en',
        displayPolicy: 'LINK_ONLY',
        modelUsePolicy: 'PROHIBITED',
        publicExcerpt: null,
        contextBeforeId: null,
        contextAfterId: null,
        reviewStatus: 'APPROVED',
      },
    ],
    fdaApprovals: [
      {
        id: 'approval_fda_fixture',
        authority: 'FDA',
        applicationNumber: 'NDA000001',
        submissionNumber: 'ORIG-1',
        approvalStatus: 'APPROVED',
        approvalDate: '2025-02-01',
        statusAsOf: '2026-09-10',
        indicationText: 'Metastatic NSCLC with EGFR exon 21 L858R.',
        biomarkerText: 'EGFR exon 21 L858R',
        labelEffectiveDate: '2025-02-01',
        sourceDocumentId: 'doc_fda_fixture',
        reviewStatus: 'APPROVED',
        reviewedBy: 'product-owner-fast-track',
        reviewedAt: '2026-09-10T00:00:00.000Z',
        drugIds: ['drug_fixturetinib'],
        diseaseLinks: [{ diseaseId: 'disease_nsclc_fixture', scope: 'EXACT' }],
        variantLinks: [
          {
            variantId: 'variant_egfr_l858r_fixture',
            scope: 'EXPLICIT_GROUP_INCLUDES_EXACT',
          },
        ],
        passageLinks: [
          {
            sourcePassageId: 'passage_fda_fixture',
            supportRole: 'INDICATION',
          },
        ],
      },
    ],
    associations: [
      {
        id: 'assoc_fixture',
        diseaseId: 'disease_nsclc_fixture',
        variantId: 'variant_egfr_l858r_fixture',
        therapyKey: 'drug_fixturetinib:PRIMARY',
        direction: 'SENSITIVITY',
        variantApplicability: 'EXPLICIT_GROUP_INCLUDES_EXACT',
        proposedLevel: '1',
        approvedLevel: '1',
        gradingRuleVersion: 'evidex-therapeutic-v1',
        gradingRationale: 'FDA indication covers NSCLC and EGFR L858R.',
        gradingInput: {
          diseaseApplicability: 'SAME_DISEASE',
          regulatoryAlignment: 'MATCHED_INDICATION',
          guidelineSupported: false,
          biomarkerSpecificResistance: false,
        },
        reviewStatus: 'APPROVED',
        reviewedBy: 'product-owner-fast-track',
        reviewedAt: '2026-09-10T00:00:00.000Z',
        drugs: [{ drugId: 'drug_fixturetinib', role: 'PRIMARY', sortOrder: 0 }],
      },
    ],
    evidenceClaims: [
      {
        id: 'claim_fixture',
        associationId: 'assoc_fixture',
        claimType: 'EFFICACY',
        evidenceMaturity: 'MATURE_CLINICAL',
        studyType: 'Randomized phase 3 trial',
        studyName: 'FIXTURE',
        populationSummary: 'Untreated advanced EGFR-mutated NSCLC.',
        sampleSize: 100,
        diseaseStage: 'Locally advanced or metastatic',
        treatmentLine: 'First line',
        priorTherapy: null,
        intervention: 'fixturetinib',
        comparator: 'chemotherapy',
        endpoint: 'Progression-free survival',
        effectValue: { hazardRatio: 0.5 },
        conclusion: 'Fixturetinib improved progression-free survival.',
        limitations: 'The result combines exon 19 deletion and L858R.',
        cohortFingerprint: 'NCT00000001',
        reviewStatus: 'APPROVED',
        reviewedBy: 'product-owner-fast-track',
        reviewedAt: '2026-09-10T00:00:00.000Z',
        passageLinks: [
          {
            sourcePassageId: 'passage_pubmed_fixture',
            supportRole: 'PRIMARY',
          },
        ],
      },
    ],
    release: {
      id: 'release_fixture',
      version: 'v-fixture',
      status: 'PUBLISHED',
      literatureCutoffAt: '2026-09-10T00:00:00.000Z',
      regulatoryCutoffAt: '2026-09-10T00:00:00.000Z',
      gradingRuleVersion: 'evidex-therapeutic-v1',
      publishedAt: '2026-09-10T00:00:00.000Z',
      publishedBy: 'product-owner-fast-track',
      notes: 'Fixture release.',
      associationIds: ['assoc_fixture'],
      regulatoryApprovalIds: ['approval_fda_fixture'],
    },
  };
}

describe('validateKnowledgePackage', () => {
  it('accepts an approved, fully linked package and calculates its deterministic hash', () => {
    const input = createPackage();
    const validated = validateKnowledgePackage(input);

    expect(validated.release.version).toBe('v-fixture');
    expect(calculateKnowledgePackageHash(validated)).toMatch(/^[a-f0-9]{64}$/);
    expect(calculateKnowledgePackageHash(validated)).toBe(
      calculateKnowledgePackageHash(structuredClone(validated))
    );
  });

  it('rejects claims without a model-allowed PubMed PRIMARY passage', () => {
    const input = createPackage();
    input.passages[0].modelUsePolicy = 'PROHIBITED';

    expect(() => validateKnowledgePackage(input)).toThrow(
      /model-allowed PubMed PRIMARY passage/i
    );
  });

  it('rejects FDA approvals without an INDICATION passage', () => {
    const input = createPackage();
    input.fdaApprovals[0].passageLinks[0].supportRole = 'STATUS';

    expect(() => validateKnowledgePackage(input)).toThrow(
      /FDA approval.+INDICATION passage/i
    );
  });

  it('recalculates and rejects a mismatched proposed evidence level', () => {
    const input = createPackage();
    input.associations[0].proposedLevel = '3A';

    expect(() => validateKnowledgePackage(input)).toThrow(
      /proposed level 3A does not match recalculated level 1/i
    );
  });

  it('rejects missing foreign keys and non-approved released records', () => {
    const missingForeignKey = createPackage();
    missingForeignKey.evidenceClaims[0].associationId = 'assoc_missing';
    expect(() => validateKnowledgePackage(missingForeignKey)).toThrow(
      /unknown association assoc_missing/i
    );

    const unreviewed = createPackage();
    unreviewed.evidenceClaims[0].reviewStatus = 'IN_REVIEW';
    expect(() => validateKnowledgePackage(unreviewed)).toThrow(
      /released claim claim_fixture must be APPROVED/i
    );
  });

  it('rejects conflicting stable identities and malformed therapy keys', () => {
    const duplicateSource = createPackage();
    duplicateSource.publications.push({
      ...duplicateSource.publications[0],
      id: 'doc_pubmed_duplicate',
    });
    expect(() => validateKnowledgePackage(duplicateSource)).toThrow(
      /duplicate source identity PUBMED:10000001/i
    );

    const malformedTherapy = createPackage();
    malformedTherapy.associations[0].therapyKey = 'wrong';
    expect(() => validateKnowledgePackage(malformedTherapy)).toThrow(
      /therapyKey/i
    );
  });
});
