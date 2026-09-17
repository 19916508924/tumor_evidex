import { describe, expect, it } from 'vitest';

import { screenEvidenceEligibility } from '@/shared/services/evidence-platform/screen-evidence-eligibility';

const association = {
  id: 'association-egfr-l858r',
  approvedLevel: '1',
  gradingRationale: 'Reviewed.',
  eligibilityTerms: {
    diseases: ['NSCLC'],
    genes: ['EGFR'],
    variants: ['L858R'],
  },
};

function source(title: string, abstract: string) {
  return {
    pmid: '12345678',
    title,
    abstract,
    documentHash: 'hash',
    url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
  };
}

describe('evidence eligibility target attribution', () => {
  it('includes an exact disease, gene, and variant match', async () => {
    const result = await screenEvidenceEligibility({
      source: source(
        'Osimertinib in EGFR L858R NSCLC',
        'Patients with EGFR L858R-mutant NSCLC were enrolled.'
      ),
      association,
    });

    expect(result.decision).toMatchObject({
      decision: 'INCLUDE',
      code: 'EXACT_VARIANT_TARGET_FOUND',
      ruleVersion: 'eligibility-v2',
      matchedTerms: {
        diseases: ['NSCLC'],
        genes: ['EGFR'],
        variants: ['L858R'],
      },
    });
  });

  it('never binds a different variant to the preselected association', async () => {
    const result = await screenEvidenceEligibility({
      source: source(
        'Osimertinib in EGFR T790M NSCLC',
        'Patients with EGFR T790M-positive NSCLC were enrolled.'
      ),
      association,
    });

    expect(result.decision).toMatchObject({
      decision: 'NEEDS_HUMAN',
      code: 'TARGET_VARIANT_NOT_FOUND',
      ruleVersion: 'eligibility-v2',
      matchedTerms: { variants: [] },
    });
  });

  it('requires a human decision when an exact-variant target has no variant mention', async () => {
    const result = await screenEvidenceEligibility({
      source: source(
        'Osimertinib in EGFR-mutant NSCLC',
        'Patients with EGFR-mutant NSCLC were enrolled.'
      ),
      association,
    });

    expect(result.decision).toMatchObject({
      decision: 'NEEDS_HUMAN',
      code: 'TARGET_VARIANT_NOT_FOUND',
      ruleVersion: 'eligibility-v2',
    });
  });
});
