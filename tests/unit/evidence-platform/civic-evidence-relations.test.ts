import { describe, expect, it } from 'vitest';

import {
  civicRelationshipProposals,
  findExistingCivicAssociation,
  sourceConfirmsCivicTherapies,
} from '@/shared/services/evidence-platform/civic-evidence-relations';
import type {
  CivicCandidateProvenance,
  CivicEvidenceItemProvenance,
} from '@/shared/services/evidence-platform/civic-source-adapter';
import type { AssociationReviewContext } from '@/shared/services/evidence-platform/upstream-workflow';

function evidenceItem(
  overrides: Partial<CivicEvidenceItemProvenance> = {}
): CivicEvidenceItemProvenance {
  return {
    eid: 1,
    name: 'EID1',
    molecularProfile: 'EGFR L858R',
    disease: 'Lung Non-small Cell Carcinoma',
    diseaseDoid: '3908',
    therapies: ['Erlotinib'],
    evidenceLevel: 'B',
    evidenceDirection: 'SUPPORTS',
    significance: 'SENSITIVITYRESPONSE',
    citation: null,
    publicationYear: 2020,
    applicability: 'EXACT',
    ...overrides,
  };
}

function provenance(
  evidenceItems: CivicEvidenceItemProvenance[]
): CivicCandidateProvenance {
  return {
    source: 'CIVIC',
    retrievedAt: '2026-09-17T00:00:00.000Z',
    query: {
      version: 1,
      diseaseId: 'disease_nsclc',
      variantId: 'variant_egfr_l858r',
      geneSymbol: 'EGFR',
      profileName: 'L858R',
      diseaseName: 'Lung Non-small Cell Carcinoma',
    },
    evidenceItems,
  };
}

const contexts: AssociationReviewContext[] = [
  {
    id: 'association-osimertinib',
    approvedLevel: '1',
    gradingRationale: 'Reviewed.',
    therapyNames: ['osimertinib'],
    therapyMatchTerms: [['osimertinib', 'AZD9291']],
  },
  {
    id: 'association-combination',
    approvedLevel: '1',
    gradingRationale: 'Reviewed.',
    therapyNames: ['amivantamab', 'lazertinib'],
    therapyMatchTerms: [['amivantamab', 'JNJ-61186372'], ['lazertinib']],
  },
  {
    id: 'association-gefitinib',
    approvedLevel: '1',
    gradingRationale: 'Reviewed.',
    therapyNames: ['gefitinib'],
  },
];

describe('CIViC evidence relationship proposals', () => {
  it('maps direction and applicability, removes empty therapies, and deduplicates normalized proposals', () => {
    const result = civicRelationshipProposals(
      provenance([
        evidenceItem({ therapies: [' Erlotinib ', 'erlotinib'] }),
        evidenceItem({ eid: 2, therapies: ['erlotinib'] }),
        evidenceItem({
          eid: 3,
          therapies: ['Neratinib'],
          significance: 'RESISTANCE',
          applicability: 'GROUP_INCLUDES_EXACT',
        }),
        evidenceItem({
          eid: 4,
          therapies: ['Dacomitinib'],
          evidenceDirection: 'DISPUTES',
          applicability: 'COMPOUND_REQUIRES_REVIEW',
        }),
        evidenceItem({
          eid: 5,
          therapies: ['Crizotinib'],
          significance: 'ONCOGENIC',
          applicability: 'OTHER_REQUIRES_REVIEW',
        }),
        evidenceItem({ eid: 6, therapies: [] }),
      ])
    );

    expect(result).toEqual([
      {
        therapies: ['erlotinib'],
        direction: 'SENSITIVITY',
        variantApplicability: 'EXACT',
      },
      {
        therapies: ['Neratinib'],
        direction: 'RESISTANCE',
        variantApplicability: 'EXPLICIT_GROUP_INCLUDES_EXACT',
      },
      {
        therapies: ['Dacomitinib'],
        direction: 'EXPLORATORY',
        variantApplicability: 'UNKNOWN',
      },
      {
        therapies: ['Crizotinib'],
        direction: 'EXPLORATORY',
        variantApplicability: 'UNKNOWN',
      },
    ]);
    expect(civicRelationshipProposals(undefined)).toEqual([]);
  });

  it('matches existing single and combination associations by aliases without depending on order', () => {
    expect(findExistingCivicAssociation(['AZD9291'], contexts)?.id).toBe(
      'association-osimertinib'
    );
    expect(
      findExistingCivicAssociation(['lazertinib', 'JNJ-61186372'], contexts)?.id
    ).toBe('association-combination');
    expect(findExistingCivicAssociation(['Gefitinib'], contexts)?.id).toBe(
      'association-gefitinib'
    );
    expect(findExistingCivicAssociation(['unknown'], contexts)).toBeUndefined();
    expect(findExistingCivicAssociation([], contexts)).toBeUndefined();
  });

  it('requires every therapy to be present in allowed source text while honoring known aliases', () => {
    const source = {
      pmid: '24868098',
      title: 'Osimertinib in EGFR L858R NSCLC',
      abstract: 'Patients received osimertinib with amivantamab.',
      fullText: 'The regimen also included lazertinib.',
      documentHash: 'source-hash',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24868098/',
    };
    expect(sourceConfirmsCivicTherapies(source, ['AZD9291'], contexts)).toBe(
      true
    );
    expect(
      sourceConfirmsCivicTherapies(
        source,
        ['JNJ-61186372', 'lazertinib'],
        contexts
      )
    ).toBe(true);
    expect(sourceConfirmsCivicTherapies(source, ['erlotinib'], contexts)).toBe(
      false
    );
    expect(
      sourceConfirmsCivicTherapies(
        { ...source, title: 'Erlotinib study', fullText: null },
        ['Erlotinib'],
        contexts
      )
    ).toBe(true);
  });
});
