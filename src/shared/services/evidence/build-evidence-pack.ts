import type {
  EvidenceClaimResult,
  EvidencePack,
  EvidenceResultGroup,
  EvidenceScope,
  EvidenceTherapyResult,
  KnowledgeReleaseInfo,
  NormalizedEvidenceQuery,
  PublicEvidencePassage,
  PublicEvidenceResultGroup,
} from '@/shared/types/evidence';

const scopeOrder: Record<EvidenceScope, number> = {
  SAME_DISEASE: 0,
  CROSS_INDICATION_EXACT_VARIANT: 1,
};

const directionOrder = {
  SENSITIVITY: 0,
  EXPLORATORY: 1,
  RESISTANCE: 2,
} as const;

const levelOrder = {
  '1': 0,
  '2': 1,
  '3A': 2,
  '3B': 3,
  '4': 4,
  R1: 5,
  R2: 6,
  UNRATED: 7,
} as const;

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'en');
}

function sortTherapies(
  left: EvidenceTherapyResult,
  right: EvidenceTherapyResult
) {
  return (
    directionOrder[left.direction] - directionOrder[right.direction] ||
    levelOrder[left.approvedLevel] - levelOrder[right.approvedLevel] ||
    compareText(
      left.drugs[0]?.genericName ?? left.associationId,
      right.drugs[0]?.genericName ?? right.associationId
    ) ||
    compareText(left.associationId, right.associationId)
  );
}

function stableTherapy(therapy: EvidenceTherapyResult): EvidenceTherapyResult {
  return {
    ...structuredClone(therapy),
    drugs: [...therapy.drugs].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || compareText(left.id, right.id)
    ),
    regulatoryApprovals: [...therapy.regulatoryApprovals].sort((left, right) =>
      compareText(left.id, right.id)
    ),
    evidenceClaims: [...therapy.evidenceClaims]
      .sort((left, right) => compareText(left.id, right.id))
      .map((claim) => ({
        ...structuredClone(claim),
        passages: [...claim.passages].sort((left, right) =>
          compareText(left.id, right.id)
        ),
      })),
  };
}

function stableGroups(resultGroups: EvidenceResultGroup[]) {
  return [...resultGroups]
    .sort((left, right) => scopeOrder[left.scope] - scopeOrder[right.scope])
    .map((group) => ({
      scope: group.scope,
      therapies: group.therapies.map(stableTherapy).sort(sortTherapies),
    }));
}

export function buildEvidencePack({
  query,
  release,
  resultGroups,
}: {
  query: NormalizedEvidenceQuery;
  release: KnowledgeReleaseInfo;
  resultGroups: EvidenceResultGroup[];
}): EvidencePack {
  const groups = stableGroups(resultGroups).map((group) => ({
    ...group,
    therapies: group.therapies.map((therapy) => ({
      ...therapy,
      evidenceClaims: therapy.evidenceClaims.map((claim) => ({
        ...claim,
        passages: claim.passages.filter(
          (passage) => passage.modelUsePolicy === 'ALLOWED'
        ),
      })),
    })),
  }));

  return {
    normalizedQuery: structuredClone(query),
    knowledge: structuredClone(release),
    groups,
  };
}

function toPublicPassage(
  passage: EvidenceClaimResult['passages'][number]
): PublicEvidencePassage {
  const publicPassage: PublicEvidencePassage = {
    id: passage.id,
    source: structuredClone(passage.source),
    section: passage.section,
    paragraphIndex: passage.paragraphIndex,
    locator: structuredClone(passage.locator),
    displayPolicy: passage.displayPolicy,
    supportRole: passage.supportRole,
  };

  if (passage.displayPolicy === 'FULL_TEXT') {
    publicPassage.text = passage.originalText;
  } else if (
    passage.displayPolicy === 'EXCERPT' &&
    passage.publicExcerpt !== null
  ) {
    publicPassage.text = passage.publicExcerpt;
  }

  return publicPassage;
}

export function toPublicResultGroups(
  resultGroups: EvidenceResultGroup[]
): PublicEvidenceResultGroup[] {
  return stableGroups(resultGroups).map((group) => ({
    scope: group.scope,
    therapies: group.therapies.map((therapy) => ({
      ...therapy,
      evidenceClaims: therapy.evidenceClaims.map((claim) => ({
        ...claim,
        passages: claim.passages.map(toPublicPassage),
      })),
    })),
  }));
}
