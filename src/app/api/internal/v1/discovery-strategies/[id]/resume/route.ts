import { OperationsError } from '@/shared/services/evidence-platform/operations';
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
      const data =
        await getEvidencePlatformRuntime().operationsRepository.setDiscoveryStrategyStatus(
          { id, status: 'ACTIVE', actorId: actor.id }
        );
      if (!data) throw new OperationsError('DISCOVERY_STRATEGY_NOT_FOUND', 404);
      return data;
    },
    { mutation: true }
  );
}
