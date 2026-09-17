import type {
  AssociationDirection,
  EvidenceLevel,
  EvidenceMaturity,
  EvidenceQueryInput,
  NormalizedEvidenceQuery,
  PassageDisplayPolicy,
  VariantApplicability,
} from './evidence';

export interface ApiSuccess<T> {
  code: 0;
  message: 'ok';
  data: T;
}

export interface ApiError {
  code: -1;
  message: string;
  details?: unknown;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PageResult<T> {
  items: T[];
  pagination: PageInfo;
}

export type KnowledgeEntityType = 'disease' | 'gene' | 'variant' | 'drug';

export interface PublicReleaseReference {
  id: string;
  version: string;
  literatureCutoffAt: string;
  regulatoryCutoffAt: string;
  gradingRuleVersion?: string;
  publishedAt: string;
}

export interface ReviewPublicationPreview {
  currentApprovedLevel: EvidenceLevel | null;
  currentGradingRationale: string | null;
  proposedApprovedLevel: EvidenceLevel;
  proposedGradingRationale: string;
  levelChanged: boolean;
  newClaimCount: number;
  modifiedClaimCount: 0;
  source: {
    sourceType: 'PUBMED';
    externalId: string;
    sourceScope: 'ABSTRACT' | 'PMC_FULL_TEXT';
  };
  currentRelease: { id: string; version: string } | null;
  expectedNextRelease: string | null;
}

export interface ReleaseAssociationSnapshot {
  associationId: string;
  approvedLevel: EvidenceLevel;
  gradingRationale: string;
}

export interface KnowledgeEntityListItem {
  id: string;
  type: KnowledgeEntityType;
  canonicalName: string;
  displayNameZh: string;
  displayNameEn: string;
  aliases: string[];
}

export interface KnowledgeRelationSummary {
  id: string;
  disease: {
    id: string;
    canonicalName: string;
    displayNameZh: string;
    displayNameEn: string;
  };
  gene: { id: string; symbol: string; name: string };
  variant: {
    id: string;
    alterationType: string;
    hgvsp: string | null;
    canonicalKey: string;
    applicability: VariantApplicability;
  };
  drugs: Array<{
    id: string;
    genericName: string;
    displayNameZh: string;
    displayNameEn: string;
    role: 'PRIMARY' | 'COMBINATION_COMPONENT';
    sortOrder: number;
  }>;
  therapyKey: string;
  direction: AssociationDirection;
  approvedLevel: EvidenceLevel;
  gradingRationale: string;
  claimCount: number;
  regulatoryApprovalCount: number;
}

export interface KnowledgeEntityDetail {
  release: PublicReleaseReference;
  entity: KnowledgeEntityListItem & Record<string, unknown>;
  associations: KnowledgeRelationSummary[];
  related: {
    diseases: KnowledgeEntityListItem[];
    genes: KnowledgeEntityListItem[];
    variants: KnowledgeEntityListItem[];
    drugs: KnowledgeEntityListItem[];
  };
}

export interface PublicPassageDetail {
  id: string;
  section: string | null;
  paragraphIndex: number | null;
  locator: Record<string, unknown>;
  displayPolicy: PassageDisplayPolicy;
  modelUsePolicy?: 'ALLOWED' | 'PROHIBITED';
  supportRole?: string;
  text?: string;
}

export interface PublicEvidenceDetail {
  release: PublicReleaseReference;
  claim: {
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
  };
  association: KnowledgeRelationSummary;
  passages: Array<
    PublicPassageDetail & {
      source: {
        id: string;
        sourceType: 'PUBMED' | 'FDA';
        externalId: string;
        title: string;
        url: string;
        doi: string | null;
        pmcid: string | null;
      };
    }
  >;
}

export interface PublicSourceDetail {
  release: PublicReleaseReference;
  source: {
    id: string;
    sourceType: 'PUBMED' | 'FDA';
    externalId: string;
    title: string;
    publisherOrAgency: string | null;
    journal: string | null;
    publicationDate: string | null;
    doi: string | null;
    pmcid: string | null;
    url: string;
    sourceScope: string;
    language: string;
  };
  passages: PublicPassageDetail[];
  evidenceClaimIds: string[];
  regulatoryApprovalIds: string[];
}

export type FeedbackCategory =
  | 'HELPFUL'
  | 'NOT_HELPFUL'
  | 'IRRELEVANT_CITATION'
  | 'MISSING_LIMITATION'
  | 'HARD_TO_UNDERSTAND'
  | 'OTHER';

export interface QuestionFeedbackResult {
  id: string;
  questionRunId: string;
  answerVersion: string;
  knowledgeRelease: string;
  category: FeedbackCategory;
  createdAt: string;
  idempotent: boolean;
}

export type PublicQuestionRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'NEEDS_CLARIFICATION'
  | 'ANSWERED'
  | 'NO_CURATED_EVIDENCE'
  | 'OUT_OF_SCOPE'
  | 'SUMMARY_UNAVAILABLE'
  | 'FAILED'
  | 'CANCELLED';

export type PublicQuestionProgress =
  | 'UNDERSTANDING_QUESTION'
  | 'RETRIEVING_APPROVED_EVIDENCE'
  | 'ORGANIZING_EVIDENCE'
  | 'COMPOSING_ANSWER'
  | 'VALIDATING_CITATIONS'
  | 'COMPLETED';

export type PublicQuestionInterpretation =
  | {
      status: 'RESOLVED';
      intent: 'EVIDENCE_QA' | 'THERAPY_COMPARISON' | 'REGULATORY_STATUS';
      redactedQuestion: string;
      query: EvidenceQueryInput;
      normalizedQuery: NormalizedEvidenceQuery;
      drugs: string[];
    }
  | {
      status: 'NEEDS_CLARIFICATION';
      redactedQuestion: string;
      missingFields: Array<'disease' | 'gene' | 'variant'>;
      question: string;
    }
  | {
      status: 'OUT_OF_SCOPE';
      redactedQuestion: string;
      reason: 'DOSAGE_OR_REGIMEN' | 'PERSONAL_TREATMENT_RECOMMENDATION';
    };

export interface QuestionRunSubmissionResult {
  questionRunId: string;
  status: PublicQuestionRunStatus;
  pollAfterMs: number;
}

export interface PublicQuestionRunResponse {
  id: string;
  questionRunId: string;
  status: PublicQuestionRunStatus;
  progress: PublicQuestionProgress;
  pollAfterMs: number | null;
  question: string;
  normalizedQuestion: PublicQuestionInterpretation;
  knowledgeRelease: {
    id: string;
    version: string;
    literatureCutoffAt?: string;
    regulatoryCutoffAt?: string;
    gradingRuleVersion?: string;
  };
  result: unknown | null;
  disclaimer: string;
  disclaimerEn: string;
  createdAt: string;
  completedAt: string | null;
}

export interface OpsListQuery {
  page: number;
  pageSize: number;
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  waitingAge?: '24h' | '72h' | '7d';
  diseaseId?: string;
  geneId?: string;
  variantId?: string;
  risk?: 'LOW' | 'MEDIUM' | 'HIGH';
  blocking?: boolean;
}

export interface DiscoveryCounts {
  discovered: number;
  duplicate: number;
  excluded: number;
  processing: number;
  readyForReview: number;
  published: number;
  failed: number;
}

export interface DiscoveryStrategyDto {
  id: string;
  name: string;
  version: string;
  query: string;
  associationId: string;
  status: 'ACTIVE' | 'PAUSED';
  scheduleTimezone: string;
  scheduleRrule: string | null;
  overlapDays: number;
  maxResults: number;
  lastSuccessfulCutoffAt: string | null;
  nextRunAt: string | null;
  updatedAt: string;
}

export interface DiscoveryRunDto {
  id: string;
  strategyId: string;
  triggerType: 'MANUAL' | 'SCHEDULED';
  triggeredBy: string;
  workflowVersion: string;
  scopeMode: 'ALL_KNOWLEDGE' | 'SCOPED';
  scopeSnapshot: Record<string, unknown>;
  documentLimit: 50 | 100 | null;
  estimatedMatchCount: number;
  uniqueDiscoveredCount: number;
  processedDocumentCount: number;
  sourceCursor: string | null;
  previewHash: string | null;
  windowFrom: string;
  windowTo: string;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'PARTIAL_SUCCESS'
    | 'PAUSED'
    | 'FAILED'
    | 'CANCELLED';
  counts: DiscoveryCounts;
  errorCode: string | null;
  errorSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface DiscoveryScopeSnapshotDto {
  source?: 'PUBMED' | 'CIVIC';
  mode: 'ALL_KNOWLEDGE' | 'SCOPED';
  diseaseIds: string[];
  geneIds: string[];
  variantIds: string[];
  aliasVersion: string;
  knowledgeReleaseId: string;
  knowledgeReleaseVersion: string;
}

export interface DiscoveryQueryPlanDto {
  strategyId: string;
  strategyVersion: string;
  associationId: string;
  query: string;
  label: string;
  estimatedMatchCount?: number;
  sourceCursor?: string | null;
  fetchedPageCount?: number;
  exhausted?: boolean;
  updatedAt?: string;
}

export interface DiscoveryPreviewDto {
  snapshot: DiscoveryScopeSnapshotDto;
  documentLimit: 50 | 100 | 'ALL';
  window: { from: string; to: string };
  queries: DiscoveryQueryPlanDto[];
  estimatedMatchCount: number;
  warnings: string[];
  previewHash: string;
  expiresAt: string;
  previewToken: string;
}

export interface DiscoveryRunDetailDto {
  run: DiscoveryRunDto;
  strategy: DiscoveryStrategyDto;
  queries: DiscoveryQueryPlanDto[];
  candidates: Array<{
    id: string;
    externalId: string;
    title: string;
    status: string;
    workflowRunId?: string | null;
    createdAt: string;
  }>;
}

export interface OperationsAssociationDto {
  id: string;
  diseaseDisplayNameZh: string;
  geneSymbol: string;
  canonicalKey: string;
  drugs: Array<{ displayNameZh: string; genericName?: string }>;
}

export interface OpsDashboardDto {
  range: '7d' | '30d';
  counts: DiscoveryCounts;
  backlog: { reviewTasks: number; oldestWaitingSince: string | null };
  workflow: {
    total: number;
    failed: number;
    needsHuman: number;
    retries: number;
    failureRate: number;
  };
  latestDiscoveryRun: DiscoveryRunDto | null;
  latestRelease: PublicReleaseReference | null;
  alerts: Array<{
    code: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    message: string;
    resourceId?: string;
  }>;
}
