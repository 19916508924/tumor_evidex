import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute, opsListQuery } from '../route-helpers';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return internalRoute(request, async () =>
    getEvidencePlatformRuntime().operationsRepository.listReleases(
      opsListQuery(request)
    )
  );
}
