import type {
  AssociationGradingInput,
  EvidenceLevel,
} from '@/shared/types/evidence';

const crossIndicationSourceLevels = new Set<EvidenceLevel>(['1', '2', '3A']);
const directVariantApplicabilities = new Set([
  'EXACT',
  'EXPLICIT_GROUP_INCLUDES_EXACT',
]);

export function gradeAssociation(
  input: AssociationGradingInput
): EvidenceLevel {
  if (input.diseaseApplicability !== 'SAME_DISEASE') {
    const canPropagate =
      input.diseaseApplicability === 'OTHER_SOLID_TUMOR_EXACT_VARIANT' &&
      input.variantApplicability === 'EXACT' &&
      input.direction === 'SENSITIVITY' &&
      input.sourceApprovedLevel !== undefined &&
      crossIndicationSourceLevels.has(input.sourceApprovedLevel);

    return canPropagate ? '3B' : 'UNRATED';
  }

  if (!directVariantApplicabilities.has(input.variantApplicability)) {
    return 'UNRATED';
  }

  if (input.direction === 'RESISTANCE') {
    if (
      input.regulatoryAlignment === 'MATCHED_INDICATION' &&
      input.biomarkerSpecificResistance
    ) {
      return 'R1';
    }

    return input.evidenceMaturities.includes('MATURE_CLINICAL')
      ? 'R2'
      : 'UNRATED';
  }

  if (input.direction === 'SENSITIVITY') {
    if (input.regulatoryAlignment === 'MATCHED_INDICATION') {
      return '1';
    }
    if (input.guidelineSupported) {
      return '2';
    }
    if (input.evidenceMaturities.includes('MATURE_CLINICAL')) {
      return '3A';
    }
  }

  const supportsLevelFour = input.evidenceMaturities.some((maturity) =>
    ['LIMITED_CLINICAL', 'PRECLINICAL'].includes(maturity)
  );

  return supportsLevelFour ? '4' : 'UNRATED';
}
