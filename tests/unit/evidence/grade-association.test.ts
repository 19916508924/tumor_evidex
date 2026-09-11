import { describe, expect, it } from 'vitest';

import { gradeAssociation } from '@/shared/services/evidence/grade-association';
import type { AssociationGradingInput } from '@/shared/types/evidence';

const directSensitivity: AssociationGradingInput = {
  direction: 'SENSITIVITY',
  diseaseApplicability: 'SAME_DISEASE',
  variantApplicability: 'EXACT',
  evidenceMaturities: ['MATURE_CLINICAL'],
  regulatoryAlignment: 'OTHER_INDICATION',
  guidelineSupported: false,
  biomarkerSpecificResistance: false,
};

describe('gradeAssociation', () => {
  it('assigns Level 1 only when the FDA indication covers disease and variant', () => {
    expect(
      gradeAssociation({
        ...directSensitivity,
        regulatoryAlignment: 'MATCHED_INDICATION',
      })
    ).toBe('1');
    expect(gradeAssociation(directSensitivity)).toBe('3A');
  });

  it('supports the explicit guideline rule but keeps it independent of FDA status', () => {
    expect(
      gradeAssociation({ ...directSensitivity, guidelineSupported: true })
    ).toBe('2');
  });

  it.each([
    ['MATURE_CLINICAL', '3A'],
    ['LIMITED_CLINICAL', '4'],
    ['PRECLINICAL', '4'],
    ['INSUFFICIENT', 'UNRATED'],
  ] as const)(
    'maps same-disease %s sensitivity evidence to %s',
    (maturity, level) => {
      expect(
        gradeAssociation({
          ...directSensitivity,
          evidenceMaturities: [maturity],
        })
      ).toBe(level);
    }
  );

  it.each(['1', '2', '3A'] as const)(
    'projects an eligible exact solid-tumor source level %s to 3B',
    (sourceApprovedLevel) => {
      expect(
        gradeAssociation({
          ...directSensitivity,
          diseaseApplicability: 'OTHER_SOLID_TUMOR_EXACT_VARIANT',
          sourceApprovedLevel,
        })
      ).toBe('3B');
    }
  );

  it.each([
    {
      diseaseApplicability: 'OTHER_SOLID_TUMOR_EXACT_VARIANT',
      variantApplicability: 'EXPLICIT_GROUP_INCLUDES_EXACT',
      sourceApprovedLevel: '3A',
    },
    {
      diseaseApplicability: 'OTHER_HEMATOLOGIC_EXACT_VARIANT',
      variantApplicability: 'EXACT',
      sourceApprovedLevel: '3A',
    },
    {
      diseaseApplicability: 'OTHER_SOLID_TUMOR_EXACT_VARIANT',
      variantApplicability: 'EXACT',
      sourceApprovedLevel: '4',
    },
    {
      diseaseApplicability: 'OTHER_SOLID_TUMOR_EXACT_VARIANT',
      variantApplicability: 'EXACT',
      sourceApprovedLevel: 'R1',
    },
  ] as const)(
    'does not propagate an ineligible cross-indication association',
    (overrides) => {
      expect(gradeAssociation({ ...directSensitivity, ...overrides })).toBe(
        'UNRATED'
      );
    }
  );

  it('assigns R1 only for same-disease biomarker-specific regulatory resistance', () => {
    expect(
      gradeAssociation({
        ...directSensitivity,
        direction: 'RESISTANCE',
        regulatoryAlignment: 'MATCHED_INDICATION',
        biomarkerSpecificResistance: true,
      })
    ).toBe('R1');
  });

  it('assigns R2 for mature same-disease clinical resistance', () => {
    expect(
      gradeAssociation({
        ...directSensitivity,
        direction: 'RESISTANCE',
      })
    ).toBe('R2');
  });

  it('does not upgrade exploratory evidence above Level 4', () => {
    expect(
      gradeAssociation({
        ...directSensitivity,
        direction: 'EXPLORATORY',
      })
    ).toBe('UNRATED');
    expect(
      gradeAssociation({
        ...directSensitivity,
        direction: 'EXPLORATORY',
        evidenceMaturities: ['LIMITED_CLINICAL'],
      })
    ).toBe('4');
  });

  it('does not grade a same-disease gene-only association', () => {
    expect(
      gradeAssociation({
        ...directSensitivity,
        variantApplicability: 'GENE_ONLY',
      })
    ).toBe('UNRATED');
  });
});
