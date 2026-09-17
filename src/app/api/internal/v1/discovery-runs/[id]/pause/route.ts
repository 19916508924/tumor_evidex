import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute } from '../../../route-helpers';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return internalRoute(
    request,
    async (actor) =>
      getEvidencePlatformRuntime().discoveryRepository.transitionDiscoveryRun({
        runId: (await context.params).id,
        action: 'pause',
        actorId: actor.id,
      }),
    { mutation: true }
  );
}
