import {
  PlatformApiError,
  requireInternalActor,
  respondToError,
} from '@/shared/services/evidence-platform/http';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalActor();
  } catch (error) {
    return respondToError(error, 'REVIEW_TASK_READ_FAILED');
  }
  const { id } = await context.params;
  const data =
    await getEvidencePlatformRuntime().reviewRepository.getReviewTask(id);
  if (!data) {
    return respondToError(
      new PlatformApiError('REVIEW_TASK_NOT_FOUND', 404),
      'REVIEW_TASK_READ_FAILED'
    );
  }
  return Response.json({ code: 0, message: 'ok', data });
}
