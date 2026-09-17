export const EVIDENCE_LEVELS = [
  '1',
  '2',
  '3A',
  '3B',
  '4',
  'R1',
  'R2',
  'UNRATED',
] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export type AssociationDirection = 'SENSITIVITY' | 'RESISTANCE' | 'EXPLORATORY';

export type DiseaseApplicability =
  | 'SAME_DISEASE'
  | 'OTHER_SOLID_TUMOR_EXACT_VARIANT'
  | 'OTHER_HEMATOLOGIC_EXACT_VARIANT'
  | 'OTHER_DISEASE_NON_EXACT';

export type VariantApplicability =
  | 'EXACT'
  | 'EXPLICIT_GROUP_INCLUDES_EXACT'
  | 'GENE_ONLY'
  | 'ANALOGOUS_VARIANT'
  | 'UNKNOWN';

export type EvidenceMaturity =
  | 'REGULATORY'
  | 'GUIDELINE'
  | 'MATURE_CLINICAL'
  | 'LIMITED_CLINICAL'
  | 'PRECLINICAL'
  | 'INSUFFICIENT';

export type RegulatoryAlignment = 'MATCHED_INDICATION' | 'OTHER_INDICATION';

export interface EvidenceQueryInput {
  disease: string;
  biomarkers: Array<{
    gene: string;
    alterationType: string;
    hgvsp: string;
  }>;
  jurisdiction: string;
  locale: string;
}

export interface NormalizedEvidenceQuery {
  disease: string;
  gene: string;
  alterationType: string;
  hgvsp: string;
  canonicalVariantKey: string;
  jurisdiction: 'US';
  locale: 'zh-CN';
}

export type EvidenceQueryNormalizationResult =
  | { status: 'VALID'; value: NormalizedEvidenceQuery }
  | {
      status: 'INVALID_INPUT';
      issues: Array<{ path: string; message: string }>;
    }
  | {
      status: 'OUT_OF_SCOPE';
      field: 'disease' | 'gene' | 'hgvsp' | 'jurisdiction' | 'locale';
    };

export interface AssociationGradingInput {
  direction: AssociationDirection;
  diseaseApplicability: DiseaseApplicability;
  variantApplicability: VariantApplicability;
  evidenceMaturities: EvidenceMaturity[];
  regulatoryAlignment: RegulatoryAlignment;
  guidelineSupported: boolean;
  biomarkerSpecificResistance: boolean;
  sourceApprovedLevel?: EvidenceLevel;
}

export type EvidenceScope = 'SAME_DISEASE' | 'CROSS_INDICATION_EXACT_VARIANT';

export interface KnowledgeReleaseInfo {
  id: string;
  version: string;
  literatureCutoffAt: string;
  regulatoryCutoffAt: string;
  gradingRuleVersion: string;
}

export interface EvidenceSourceReference {
  id: string;
  sourceType: 'PUBMED' | 'FDA';
  externalId: string;
  title: string;
  url: string;
  doi?: string | null;
  pmcid?: string | null;
}

export type PassageDisplayPolicy =
  | 'FULL_TEXT'
  | 'EXCERPT'
  | 'LINK_ONLY'
  | 'INTERNAL_ONLY';

export interface EvidencePassageResult {
  id: string;
  source: EvidenceSourceReference;
  section: string | null;
  paragraphIndex: number | null;
  locator: Record<string, unknown>;
  originalText: string;
  publicExcerpt: string | null;
  displayPolicy: PassageDisplayPolicy;
  modelUsePolicy: 'ALLOWED' | 'PROHIBITED';
  supportRole:
    | 'PRIMARY'
    | 'CONTEXT'
    | 'LIMITATION'
    | 'INDICATION'
    | 'BIOMARKER'
    | 'STATUS';
}

export interface EvidenceClaimResult {
  id: string;
  claimType: 'EFFICACY' | 'RESISTANCE' | 'SAFETY_CONTEXT' | 'OTHER';
  evidenceMaturity: EvidenceMaturity;
  studyType: string;
  studyName: string | null;
  populationSummary: string;
  sampleSize: number | null;
  diseaseStage: string | null;
  treatmentLine: string | null;
  priorTherapy: string | null;
  intervention: string;
  comparator: string | null;
  endpoint: string;
  effectValue: Record<string, unknown> | null;
  conclusion: string;
  limitations: string;
  passages: EvidencePassageResult[];
}

export interface RegulatoryApprovalResult {
  id: string;
  authority: string;
  applicationNumber: string;
  submissionNumber?: string | null;
  approvalStatus:
    | 'APPROVED'
    | 'WITHDRAWN'
    | 'INACTIVE'
    | 'NOT_APPROVED'
    | 'UNKNOWN';
  approvalDate: string;
  statusAsOf: string;
  indicationText: string;
  biomarkerText: string | null;
  labelEffectiveDate?: string | null;
  source: EvidenceSourceReference;
}

export interface EvidenceDrugResult {
  id: string;
  genericName: string;
  displayNameZh: string;
  displayNameEn: string;
  role: 'PRIMARY' | 'COMBINATION_COMPONENT';
  sortOrder: number;
}

export interface EvidenceTherapyResult {
  associationId: string;
  sourceDisease: {
    id: string;
    canonicalName: string;
    displayNameZh: string;
    displayNameEn: string;
    lineage: 'SOLID' | 'HEMATOLOGIC' | 'UNKNOWN';
  };
  variant: {
    id: string;
    gene: string;
    alterationType: string;
    hgvsp: string | null;
    canonicalKey: string;
    applicability: VariantApplicability;
  };
  drugs: EvidenceDrugResult[];
  direction: AssociationDirection;
  approvedLevel: EvidenceLevel;
  sourceApprovedLevel: EvidenceLevel;
  gradingRationale: string;
  regulatoryAlignment: RegulatoryAlignment;
  regulatoryApprovals: RegulatoryApprovalResult[];
  evidenceClaims: EvidenceClaimResult[];
}

export interface EvidenceResultGroup {
  scope: EvidenceScope;
  therapies: EvidenceTherapyResult[];
}

export interface EvidencePack {
  normalizedQuery: NormalizedEvidenceQuery;
  knowledge: KnowledgeReleaseInfo;
  groups: EvidenceResultGroup[];
}

export interface PublicEvidencePassage {
  id: string;
  source: EvidenceSourceReference;
  section: string | null;
  paragraphIndex: number | null;
  locator: Record<string, unknown>;
  displayPolicy: PassageDisplayPolicy;
  supportRole: EvidencePassageResult['supportRole'];
  text?: string;
}

export type PublicEvidenceClaim = Omit<EvidenceClaimResult, 'passages'> & {
  passages: PublicEvidencePassage[];
};

export type PublicEvidenceTherapy = Omit<
  EvidenceTherapyResult,
  'evidenceClaims'
> & {
  evidenceClaims: PublicEvidenceClaim[];
};

export interface PublicEvidenceResultGroup {
  scope: EvidenceScope;
  therapies: PublicEvidenceTherapy[];
}

export interface EvidenceAnswerStatement {
  text: string;
  evidenceIds: string[];
  regulatoryApprovalIds: string[];
}

export interface EvidenceAnswerTherapy {
  associationId: string;
  overview: string;
  statements: EvidenceAnswerStatement[];
  limitations: string[];
}

export interface EvidenceAnswerDraft {
  overallSummary: string;
  groups: Array<{
    scope: EvidenceScope;
    therapies: EvidenceAnswerTherapy[];
  }>;
  overallLimitations: string[];
}
