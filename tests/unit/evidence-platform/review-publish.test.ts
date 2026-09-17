import { describe, expect, it, vi } from 'vitest';

import {
  decideReviewTask,
  type ReviewDecisionResult,
  type ReviewPublishRepository,
  type ReviewTaskSnapshot,
} from '@/shared/services/evidence-platform/review-publish';

const task: ReviewTaskSnapshot = {
  id: 'review-1',
  status: 'READY_FOR_REVIEW',
  draftId: 'draft-1',
  draftVersion: 7,
  hasBlockingIssues: false,
  publishedReleaseId: null,
};

function repository(
  overrides: Partial<ReviewPublishRepository> = {}
): ReviewPublishRepository & Record<string, ReturnType<typeof vi.fn>> {
  const result: ReviewDecisionResult = {
    reviewTaskId: 'review-1',
    decision: 'APPROVE_AND_PUBLISH',
    status: 'PUBLISHED',
    releaseId: 'release-v1.0.1',
    releaseVersion: 'v1.0.1',
    idempotent: false,
  };
  return {
    findDecision: vi.fn().mockResolvedValue(null),
    getReviewTask: vi.fn().mockResolvedValue(task),
    saveNonPublishDecision: vi.fn(),
    publishApprovedReview: vi.fn().mockResolvedValue(result),
    ...overrides,
  } as never;
}

const approval = {
  reviewTaskId: 'review-1',
  decision: 'APPROVE_AND_PUBLISH' as const,
  expectedDraftVersion: 7,
  actorId: 'reviewer-from-session',
  comment: 'Checked against the source.',
  idempotencyKey: 'review-1:7:approve',
};

describe('review decision and publish boundary', () => {
  it('publishes only the latest reviewable draft and forwards server actor', async () => {
    const store = repository();
    await expect(
      decideReviewTask({ ...approval, repository: store })
    ).resolves.toMatchObject({ status: 'PUBLISHED', releaseVersion: 'v1.0.1' });
    expect(store.publishApprovedReview).toHaveBeenCalledWith({
      reviewTaskId: 'review-1',
      expectedDraftVersion: 7,
      actorId: 'reviewer-from-session',
      comment: 'Checked against the source.',
      idempotencyKey: 'review-1:7:approve',
    });
  });

  it('requires a non-empty reviewer comment before approval can publish', async () => {
    const store = repository();

    await expect(
      decideReviewTask({ ...approval, comment: '   ', repository: store })
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_DECISION' });
    expect(store.publishApprovedReview).not.toHaveBeenCalled();
  });

  it('returns an existing decision before reading or mutating the task', async () => {
    const previous: ReviewDecisionResult = {
      reviewTaskId: 'review-1',
      decision: 'APPROVE_AND_PUBLISH',
      status: 'PUBLISHED',
      releaseId: 'release-v1.0.1',
      releaseVersion: 'v1.0.1',
      idempotent: false,
    };
    const store = repository({
      findDecision: vi.fn().mockResolvedValue(previous),
    });

    await expect(
      decideReviewTask({ ...approval, repository: store })
    ).resolves.toEqual({ ...previous, idempotent: true });
    expect(store.getReviewTask).not.toHaveBeenCalled();
    expect(store.publishApprovedReview).not.toHaveBeenCalled();
  });

  it('rejects stale edits and blocking QA before publication', async () => {
    const staleStore = repository();
    await expect(
      decideReviewTask({
        ...approval,
        expectedDraftVersion: 6,
        repository: staleStore,
      })
    ).rejects.toMatchObject({ code: 'DRAFT_VERSION_CONFLICT' });
    expect(staleStore.publishApprovedReview).not.toHaveBeenCalled();

    const blockedStore = repository({
      getReviewTask: vi
        .fn()
        .mockResolvedValue({ ...task, hasBlockingIssues: true }),
    });
    await expect(
      decideReviewTask({ ...approval, repository: blockedStore })
    ).rejects.toMatchObject({ code: 'BLOCKING_QA_ISSUES' });
    expect(blockedStore.publishApprovedReview).not.toHaveBeenCalled();
  });

  it('requires structured fields for REQUEST_CHANGES and a reason for REJECT', async () => {
    const store = repository();
    await expect(
      decideReviewTask({
        ...approval,
        decision: 'REQUEST_CHANGES',
        requestedFields: [],
        repository: store,
      })
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_DECISION' });

    await expect(
      decideReviewTask({
        ...approval,
        decision: 'REJECT',
        comment: ' ',
        repository: store,
      })
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_DECISION' });
    expect(store.saveNonPublishDecision).not.toHaveBeenCalled();
  });

  it('records a request for changes without invoking publication', async () => {
    const expected: ReviewDecisionResult = {
      reviewTaskId: 'review-1',
      decision: 'REQUEST_CHANGES',
      status: 'REQUESTED_CHANGES',
      releaseId: null,
      releaseVersion: null,
      idempotent: false,
    };
    const store = repository({
      saveNonPublishDecision: vi.fn().mockResolvedValue(expected),
    });

    await expect(
      decideReviewTask({
        ...approval,
        decision: 'REQUEST_CHANGES',
        requestedFields: ['claims.0.limitations'],
        repository: store,
      })
    ).resolves.toEqual(expected);
    expect(store.publishApprovedReview).not.toHaveBeenCalled();
  });

  it('rejects malformed, missing, or no-longer-reviewable tasks', async () => {
    await expect(
      decideReviewTask({
        ...approval,
        expectedDraftVersion: 0,
        repository: repository(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_DECISION' });
    await expect(
      decideReviewTask({
        ...approval,
        actorId: ' ',
        repository: repository(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_DECISION' });
    await expect(
      decideReviewTask({
        ...approval,
        repository: repository({
          getReviewTask: vi.fn().mockResolvedValue(null),
        }),
      })
    ).rejects.toMatchObject({ code: 'REVIEW_TASK_NOT_FOUND' });
    await expect(
      decideReviewTask({
        ...approval,
        repository: repository({
          getReviewTask: vi
            .fn()
            .mockResolvedValue({ ...task, status: 'PUBLISHED' }),
        }),
      })
    ).rejects.toMatchObject({ code: 'INVALID_REVIEW_STATE' });
  });
});
