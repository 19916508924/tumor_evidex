import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute } from '../../../route-helpers';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return internalRoute(
    request,
    async (actor) => {
      const { id } = await context.params;
      return getEvidencePlatformRuntime().operationsRepository.retryCandidate({
        id,
        actorId: actor.id,
      });
    },
    { mutation: true, successStatus: 202 }
  );
}
