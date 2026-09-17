import { getCurrentUserWithPermission, PERMISSIONS } from '@/core/rbac';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getCurrentUserWithPermission({
    code: PERMISSIONS.ADMIN_ACCESS,
  });
  if (!actor) {
    return Response.json(
      { code: -1, message: 'AUTHENTICATION_REQUIRED' },
      { status: 401 }
    );
  }
  const { id } = await context.params;
  const data =
    await getEvidencePlatformRuntime().reviewRepository.getReviewTask(id);
  if (!data) {
    return Response.json(
      { code: -1, message: 'REVIEW_TASK_NOT_FOUND' },
      { status: 404 }
    );
  }
  return Response.json({ code: 0, message: 'ok', data });
}
