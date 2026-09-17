import { z } from 'zod';

import { getCurrentUserWithPermission, PERMISSIONS } from '@/core/rbac';
import { assertTrustedMutationOrigin } from '@/shared/services/evidence-platform/http';
import {
  decideReviewTask,
  ReviewDecisionError,
} from '@/shared/services/evidence-platform/review-publish';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export const runtime = 'nodejs';

const decisionSchema = z
  .object({
    decision: z.enum(['REQUEST_CHANGES', 'REJECT', 'APPROVE_AND_PUBLISH']),
    expectedDraftVersion: z.number().int().positive(),
    comment: z.string().max(2_000).default(''),
    requestedFields: z.array(z.string().trim().min(1)).max(100).optional(),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.decision === 'APPROVE_AND_PUBLISH' &&
      input.comment.trim().length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'Approval comment is required',
      });
    }
  });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return Response.json(
      { code: -1, message: 'UNTRUSTED_ORIGIN' },
      { status: 403 }
    );
  }
  const actor = await getCurrentUserWithPermission({
    code: PERMISSIONS.ADMIN_ACCESS,
  });
  if (!actor) {
    return Response.json(
      { code: -1, message: 'AUTHENTICATION_REQUIRED' },
      { status: 401 }
    );
  }
  let input;
  try {
    input = decisionSchema.parse(await request.json());
  } catch {
    return Response.json(
      { code: -1, message: 'INVALID_INPUT' },
      { status: 400 }
    );
  }
  const { id } = await context.params;
  try {
    const data = await decideReviewTask({
      ...input,
      reviewTaskId: id,
      actorId: actor.id,
      repository: getEvidencePlatformRuntime().reviewRepository,
    });
    return Response.json({ code: 0, message: 'ok', data });
  } catch (error) {
    if (error instanceof ReviewDecisionError) {
      const status =
        error.code === 'REVIEW_TASK_NOT_FOUND'
          ? 404
          : ['DRAFT_VERSION_CONFLICT', 'INVALID_REVIEW_STATE'].includes(
                error.code
              )
            ? 409
            : 422;
      return Response.json({ code: -1, message: error.code }, { status });
    }
    console.error('Review decision failed', error);
    return Response.json(
      { code: -1, message: 'REVIEW_DECISION_FAILED' },
      { status: 500 }
    );
  }
}
