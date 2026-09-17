import { OperationsError } from '@/shared/services/evidence-platform/operations';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute } from '../../route-helpers';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return internalRoute(request, async () => {
    const { id } = await context.params;
    const data =
      await getEvidencePlatformRuntime().operationsRepository.getWorkflowRun(
        id
      );
    if (!data) throw new OperationsError('WORKFLOW_RUN_NOT_FOUND', 404);
    return data;
  });
}
