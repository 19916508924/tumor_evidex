import type { ReviewPublicationPreview } from '@/shared/types/evidence-platform-api';

export type ReviewDecisionType =
  | 'REQUEST_CHANGES'
  | 'REJECT'
  | 'APPROVE_AND_PUBLISH';

export interface ReviewTaskSnapshot {
  id: string;
  status:
    | 'PENDING'
    | 'IN_REVIEW'
    | 'REQUESTED_CHANGES'
    | 'READY_FOR_REVIEW'
    | 'REJECTED'
    | 'PUBLISHING'
    | 'PUBLISHED'
    | 'PUBLISH_FAILED';
  draftId: string;
  draftVersion: number;
  lockVersion?: number;
  assignedTo?: string | null;
  hasBlockingIssues: boolean;
  publishedReleaseId: string | null;
  candidate?: {
    id: string;
    sourceType: 'PUBMED';
    externalId: string;
    title: string;
    abstract: string;
    journal: string | null;
    publicationDate: string | null;
    doi: string | null;
    pmcid?: string | null;
    sourceScope?: 'ABSTRACT' | 'PMC_FULL_TEXT';
    license?: string | null;
    licensePolicy?: import('./upstream-workflow').CandidateSourceInput['licensePolicy'];
    sourceUrl: string;
  };
  draft?: import('./upstream-workflow').EvidenceDraftInput;
  draftMetadata?: {
    agentVersion: string;
    skillVersions: string[];
    fieldProvenance: Record<string, string[]>;
    editedBy: string | null;
    editReason: string | null;
  };
  history?: Array<{
    id: string;
    decision: ReviewDecisionType;
    expectedDraftVersion: number;
    actorId: string;
    comment: string;
    requestedFields: string[];
    resultReleaseId: string | null;
    createdAt: string;
  }>;
  workflowRunId?: string;
  currentRelease?: { id: string; version: string } | null;
  expectedNextRelease?: string | null;
  publicationPreview?: ReviewPublicationPreview;
}

export interface ReviewDecisionResult {
  reviewTaskId: string;
  decision: ReviewDecisionType;
  status: ReviewTaskSnapshot['status'];
  releaseId: string | null;
  releaseVersion: string | null;
  idempotent: boolean;
}

export interface ReviewPublishRepository {
  findDecision(idempotencyKey: string): Promise<ReviewDecisionResult | null>;
  getReviewTask(reviewTaskId: string): Promise<ReviewTaskSnapshot | null>;
  saveNonPublishDecision(input: {
    reviewTaskId: string;
    decision: Exclude<ReviewDecisionType, 'APPROVE_AND_PUBLISH'>;
    expectedDraftVersion: number;
    actorId: string;
    comment: string;
    requestedFields: string[];
    idempotencyKey: string;
  }): Promise<ReviewDecisionResult>;
  publishApprovedReview(input: {
    reviewTaskId: string;
    expectedDraftVersion: number;
    actorId: string;
    comment: string;
    idempotencyKey: string;
  }): Promise<ReviewDecisionResult>;
}

export class ReviewDecisionError extends Error {
  constructor(
    public readonly code:
      | 'REVIEW_TASK_NOT_FOUND'
      | 'DRAFT_VERSION_CONFLICT'
      | 'INVALID_REVIEW_STATE'
      | 'BLOCKING_QA_ISSUES'
      | 'INVALID_REVIEW_DECISION',
    message: string
  ) {
    super(message);
    this.name = 'ReviewDecisionError';
  }
}

export async function decideReviewTask(_input: {
  reviewTaskId: string;
  decision: ReviewDecisionType;
  expectedDraftVersion: number;
  actorId: string;
  comment: string;
  requestedFields?: string[];
  idempotencyKey: string;
  repository: ReviewPublishRepository;
}): Promise<ReviewDecisionResult> {
  const reviewTaskId = required(_input.reviewTaskId, 'reviewTaskId');
  const actorId = required(_input.actorId, 'actorId');
  const idempotencyKey = required(_input.idempotencyKey, 'idempotencyKey');
  if (
    !Number.isInteger(_input.expectedDraftVersion) ||
    _input.expectedDraftVersion < 1
  ) {
    throw new ReviewDecisionError(
      'INVALID_REVIEW_DECISION',
      'expectedDraftVersion must be a positive integer'
    );
  }

  const existing = await _input.repository.findDecision(idempotencyKey);
  if (existing) return { ...existing, idempotent: true };

  const task = await _input.repository.getReviewTask(reviewTaskId);
  if (!task) {
    throw new ReviewDecisionError(
      'REVIEW_TASK_NOT_FOUND',
      `Review task ${reviewTaskId} was not found`
    );
  }
  if (task.draftVersion !== _input.expectedDraftVersion) {
    throw new ReviewDecisionError(
      'DRAFT_VERSION_CONFLICT',
      `Expected draft version ${_input.expectedDraftVersion}, current version is ${task.draftVersion}`
    );
  }
  if (!['PENDING', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(task.status)) {
    throw new ReviewDecisionError(
      'INVALID_REVIEW_STATE',
      `Review task ${reviewTaskId} is ${task.status}`
    );
  }

  const comment = _input.comment.trim();
  if (_input.decision === 'APPROVE_AND_PUBLISH') {
    if (!comment) {
      throw new ReviewDecisionError(
        'INVALID_REVIEW_DECISION',
        'APPROVE_AND_PUBLISH requires a review comment'
      );
    }
    if (task.hasBlockingIssues) {
      throw new ReviewDecisionError(
        'BLOCKING_QA_ISSUES',
        'Blocking QA issues must be resolved before publication'
      );
    }
    return _input.repository.publishApprovedReview({
      reviewTaskId,
      expectedDraftVersion: _input.expectedDraftVersion,
      actorId,
      comment,
      idempotencyKey,
    });
  }

  const requestedFields = [
    ...new Set((_input.requestedFields ?? []).map((field) => field.trim())),
  ].filter(Boolean);
  if (_input.decision === 'REQUEST_CHANGES' && requestedFields.length === 0) {
    throw new ReviewDecisionError(
      'INVALID_REVIEW_DECISION',
      'REQUEST_CHANGES requires at least one requested field'
    );
  }
  if (_input.decision === 'REJECT' && !comment) {
    throw new ReviewDecisionError(
      'INVALID_REVIEW_DECISION',
      'REJECT requires a reason'
    );
  }
  return _input.repository.saveNonPublishDecision({
    reviewTaskId,
    decision: _input.decision,
    expectedDraftVersion: _input.expectedDraftVersion,
    actorId,
    comment,
    requestedFields,
    idempotencyKey,
  });
}

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new ReviewDecisionError(
      'INVALID_REVIEW_DECISION',
      `${label} is required`
    );
  }
  return normalized;
}
