import { describe, expect, it, vi } from 'vitest';

import {
  extractEvidenceDraft,
  extractEvidenceDraftWithTrace,
} from '@/shared/services/evidence-platform/extract-evidence-draft';

const source = {
  pmid: '12345678',
  title: 'EGFR L858R NSCLC trial',
  abstract:
    'Ten patients with EGFR L858R NSCLC received osimertinib. Median PFS was 8 months.',
  doi: '10.1000/trial',
  documentHash: 'document-hash',
  publicationDate: '2026-09-15',
  journal: 'Trial Journal',
  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
};

const targetContext = {
  eligibilityTerms: {
    diseases: ['NSCLC'],
    genes: ['EGFR'],
    variants: ['L858R'],
  },
  entityIds: {
    diseaseId: 'disease-nsclc',
    geneId: 'gene-egfr',
    variantId: 'variant-egfr-l858r',
  },
};

describe('fixed PubMed evidence extraction workflow', () => {
  it('turns a model-validated extraction into a traceable review draft', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        claims: [
          {
            claimType: 'EFFICACY',
            evidenceMaturity: 'LIMITED_CLINICAL',
            studyType: 'prospective cohort',
            studyName: null,
            populationSummary: '10 patients with NSCLC',
            sampleSize: 10,
            diseaseStage: null,
            treatmentLine: null,
            priorTherapy: null,
            intervention: 'osimertinib',
            comparator: null,
            endpoint: 'PFS',
            effectValue: { medianMonths: 8 },
            conclusion: 'Median PFS was 8 months.',
            limitations: 'Small cohort; abstract-only extraction.',
          },
        ],
        qaIssues: [
          {
            code: 'ABSTRACT_ONLY',
            severity: 'WARNING',
            message: 'Full text was not available.',
          },
        ],
      }),
    };

    const draft = await extractEvidenceDraft({
      source,
      association: {
        ...targetContext,
        id: 'assoc-egfr-l858r-osimertinib',
        approvedLevel: '1',
        gradingRationale:
          'Existing approved association; new claim pending review.',
      },
      generator,
      createId: () => 'claim-generated-1',
    });

    expect(draft).toMatchObject({
      associationId: 'assoc-egfr-l858r-osimertinib',
      proposedLevel: '3B',
      gradingRationale: expect.stringContaining('LIMITED_CLINICAL'),
      passages: [
        {
          id: 'passage-pubmed-12345678-abstract-1',
          text: 'Ten patients with EGFR L858R NSCLC received osimertinib.',
          displayPolicy: 'LINK_ONLY',
          modelUsePolicy: 'ALLOWED',
          supportRole: 'PRIMARY',
          locator: { sentenceIndex: 0 },
        },
        {
          id: 'passage-pubmed-12345678-abstract-2',
          text: 'Median PFS was 8 months.',
          displayPolicy: 'LINK_ONLY',
          modelUsePolicy: 'ALLOWED',
          supportRole: 'PRIMARY',
          locator: { sentenceIndex: 1 },
        },
      ],
      claims: [
        {
          id: 'claim-generated-1',
          passageIds: [
            'passage-pubmed-12345678-abstract-1',
            'passage-pubmed-12345678-abstract-2',
          ],
        },
      ],
      fieldProvenance: {
        'claims.0.populationSummary': ['passage-pubmed-12345678-abstract-1'],
        'claims.0.sampleSize': ['passage-pubmed-12345678-abstract-1'],
        'claims.0.intervention': ['passage-pubmed-12345678-abstract-1'],
        'claims.0.endpoint': ['passage-pubmed-12345678-abstract-2'],
        'claims.0.effectValue': [
          'passage-pubmed-12345678-abstract-1',
          'passage-pubmed-12345678-abstract-2',
        ],
        'claims.0.conclusion': ['passage-pubmed-12345678-abstract-2'],
      },
    });
    expect(draft.fieldProvenance).not.toHaveProperty('claims.0.limitations');
    expect(draft.qaIssues).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_FIELD_PROVENANCE',
        severity: 'WARNING',
      })
    );
  });

  it('executes extraction, independent grading, and QA through the Skill Runtime', async () => {
    const result = await extractEvidenceDraftWithTrace({
      source,
      association: {
        ...targetContext,
        eligibilityTerms: {
          ...targetContext.eligibilityTerms,
          variants: ['p.L858R'],
        },
        id: 'assoc-1',
        approvedLevel: '1',
        gradingRationale: 'Historical association grade.',
      },
      generator: {
        generate: vi.fn().mockResolvedValue({
          claims: [
            {
              claimType: 'RESISTANCE',
              evidenceMaturity: 'MATURE_CLINICAL',
              studyType: 'cohort',
              studyName: null,
              populationSummary: 'NSCLC population',
              sampleSize: 30,
              diseaseStage: null,
              treatmentLine: null,
              priorTherapy: null,
              intervention: 'osimertinib',
              comparator: null,
              endpoint: 'progression',
              effectValue: null,
              conclusion: 'Resistance was observed.',
              limitations: 'Abstract only.',
            },
          ],
          qaIssues: [],
        }),
      },
    });
    expect(result.draft.proposedLevel).toBe('R2');
    expect(result.traces.map((trace) => trace.skillId)).toEqual([
      'extract_evidence_claims',
      'recognize_evidence_entities',
      'normalize_evidence_entities',
      'extract_treatment_relationship',
      'propose_evidence_level',
      'validate_draft_completeness',
    ]);
    expect(result.traces.map((trace) => trace.agentId)).toEqual([
      'extraction-agent',
      'entity-recognition-agent',
      'normalization-agent',
      'relationship-agent',
      'grading-agent',
      'ingestion-qa-agent',
    ]);
    expect(result.traces.every((trace) => trace.status === 'SUCCEEDED')).toBe(
      true
    );
    expect(
      result.traces.find(
        (trace) => trace.skillId === 'normalize_evidence_entities'
      )?.output
    ).toMatchObject({
      proposedAssociationId: 'assoc-1',
      entityCandidates: {
        diseases: [
          {
            catalogId: 'disease-nsclc',
            matchedTerm: 'NSCLC',
            basis: 'SOURCE_LITERAL',
          },
        ],
        genes: [
          {
            catalogId: 'gene-egfr',
            matchedTerm: 'EGFR',
            basis: 'SOURCE_LITERAL',
          },
        ],
        variants: [
          {
            catalogId: 'variant-egfr-l858r',
            matchedTerm: 'p.L858R',
            basis: 'SOURCE_LITERAL',
          },
        ],
      },
      unresolved: [],
    });
  });

  it('blocks a resistance-only draft for a sensitivity association', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        claims: [
          {
            claimType: 'RESISTANCE',
            evidenceMaturity: 'PRECLINICAL',
            studyType: 'cell-line study',
            studyName: null,
            populationSummary: 'EGFR L858R NSCLC models',
            sampleSize: null,
            diseaseStage: null,
            treatmentLine: null,
            priorTherapy: null,
            intervention: 'erlotinib',
            comparator: null,
            endpoint: 'drug response',
            effectValue: null,
            conclusion: 'Resistance was observed.',
            limitations: 'Preclinical evidence only.',
          },
        ],
        qaIssues: [],
      }),
    };

    await expect(
      extractEvidenceDraft({
        source,
        association: {
          ...targetContext,
          id: 'assoc-egfr-l858r-erlotinib-sensitivity',
          direction: 'SENSITIVITY',
          approvedLevel: '3A',
          gradingRationale: 'Sensitivity association pending new evidence.',
        },
        generator,
      })
    ).rejects.toThrow('Draft contains a BLOCKING QA issue');
    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        association: expect.objectContaining({ direction: 'SENSITIVITY' }),
      })
    );
  });

  it('rejects empty, malformed, and blocking model output before persistence', async () => {
    const generator = {
      generate: vi.fn().mockResolvedValue({
        claims: [
          {
            claimType: 'EFFICACY',
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
            conclusion: 'No usable result.',
            limitations: 'No eligible claim.',
          },
        ],
        qaIssues: [
          { code: 'NO_ELIGIBLE_CLAIM', severity: 'BLOCKING', message: 'None.' },
        ],
      }),
    };
    await expect(
      extractEvidenceDraft({
        source,
        association: {
          ...targetContext,
          id: 'assoc-1',
          approvedLevel: '1',
          gradingRationale: 'Reviewed.',
        },
        generator,
      })
    ).rejects.toThrow();
  });

  it('creates server-owned claim identifiers by default', async () => {
    const generated = {
      claimType: 'OTHER' as const,
      evidenceMaturity: 'INSUFFICIENT' as const,
      studyType: 'case report',
      studyName: null,
      populationSummary: 'One patient',
      sampleSize: 1,
      diseaseStage: null,
      treatmentLine: null,
      priorTherapy: null,
      intervention: 'osimertinib',
      comparator: null,
      endpoint: 'response',
      effectValue: null,
      conclusion: 'A response was reported.',
      limitations: 'Single case.',
    };
    const draft = await extractEvidenceDraft({
      source,
      association: {
        ...targetContext,
        id: 'assoc-1',
        approvedLevel: '1',
        gradingRationale: 'Reviewed.',
      },
      generator: {
        generate: vi
          .fn()
          .mockResolvedValue({ claims: [generated], qaIssues: [] }),
      },
    });
    expect(draft.claims[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
