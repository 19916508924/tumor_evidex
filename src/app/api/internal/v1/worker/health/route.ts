import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute } from '../../route-helpers';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return internalRoute(request, async () =>
    getEvidencePlatformRuntime().operationsRepository.getWorkerHealth()
  );
}
