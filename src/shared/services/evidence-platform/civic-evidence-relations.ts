import type {
  AssociationDirection,
  VariantApplicability,
} from '@/shared/types/evidence';

import type {
  CivicCandidateProvenance,
  CivicEvidenceItemProvenance,
} from './civic-source-adapter';
import type {
  AssociationReviewContext,
  CandidateSourceInput,
} from './upstream-workflow';

export interface CivicRelationshipProposal {
  therapies: string[];
  direction: AssociationDirection;
  variantApplicability: VariantApplicability;
}

export function civicRelationshipProposals(
  provenance: CivicCandidateProvenance | undefined
): CivicRelationshipProposal[] {
  if (!provenance) return [];
  const proposals = provenance.evidenceItems
    .filter((item) => item.therapies.length > 0)
    .map((item) => ({
      therapies: uniqueTherapies(item.therapies),
      direction: civicDirection(item),
      variantApplicability: civicVariantApplicability(item),
    }));
  return [
    ...new Map(
      proposals.map((proposal) => [
        [
          ...proposal.therapies.map(normalizeTherapyName).sort(),
          proposal.direction,
          proposal.variantApplicability,
        ].join('|'),
        proposal,
      ])
    ).values(),
  ];
}

export function findExistingCivicAssociation(
  therapies: string[],
  associations: AssociationReviewContext[]
) {
  return associations.find((association) =>
    therapiesMatchAssociation(therapies, association)
  );
}

export function sourceConfirmsCivicTherapies(
  source: CandidateSourceInput,
  therapies: string[],
  associations: AssociationReviewContext[]
) {
  const sourceText = normalizeTherapyName(
    [source.title, source.abstract, source.fullText ?? ''].join(' ')
  );
  return therapies.every((therapy) => {
    const normalizedTherapy = normalizeTherapyName(therapy);
    const matchTerms = associations.flatMap((association) => {
      const groups = association.therapyMatchTerms?.length
        ? association.therapyMatchTerms
        : (association.therapyNames ?? []).map((name) => [name]);
      return groups
        .filter((group) =>
          group.map(normalizeTherapyName).includes(normalizedTherapy)
        )
        .flat();
    });
    return [therapy, ...matchTerms].some((term) =>
      sourceText.includes(normalizeTherapyName(term))
    );
  });
}

function therapiesMatchAssociation(
  therapies: string[],
  association: AssociationReviewContext
) {
  const groups = (
    association.therapyMatchTerms?.length
      ? association.therapyMatchTerms
      : (association.therapyNames ?? []).map((name) => [name])
  ).map((group) => new Set(group.map(normalizeTherapyName)));
  if (groups.length === 0) return false;
  const observed = therapies.map(normalizeTherapyName);
  if (observed.length !== groups.length) return false;
  const unusedGroups = new Set(groups.map((_, index) => index));
  return observed.every((therapy) => {
    const match = [...unusedGroups].find((index) => groups[index].has(therapy));
    if (match === undefined) return false;
    unusedGroups.delete(match);
    return true;
  });
}

function civicDirection(
  item: CivicEvidenceItemProvenance
): AssociationDirection {
  if (item.evidenceDirection.trim().toUpperCase() !== 'SUPPORTS') {
    return 'EXPLORATORY';
  }
  const significance = item.significance.trim().toUpperCase();
  if (significance.includes('RESISTANCE')) return 'RESISTANCE';
  if (
    significance.includes('SENSITIVITY') ||
    significance.includes('RESPONSE')
  ) {
    return 'SENSITIVITY';
  }
  return 'EXPLORATORY';
}

function civicVariantApplicability(
  item: CivicEvidenceItemProvenance
): VariantApplicability {
  if (item.applicability === 'EXACT') return 'EXACT';
  if (item.applicability === 'GROUP_INCLUDES_EXACT') {
    return 'EXPLICIT_GROUP_INCLUDES_EXACT';
  }
  return 'UNKNOWN';
}

function uniqueTherapies(therapies: string[]) {
  return [
    ...new Map(
      therapies.map((therapy) => [
        normalizeTherapyName(therapy),
        therapy.trim(),
      ])
    ).values(),
  ];
}

function normalizeTherapyName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
