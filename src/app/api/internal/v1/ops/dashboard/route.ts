import { OperationsError } from '@/shared/services/evidence-platform/operations';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute } from '../../route-helpers';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return internalRoute(request, async () => {
    const raw = new URL(request.url).searchParams.get('range');
    if (raw && raw !== '7d' && raw !== '30d') {
      throw new OperationsError('INVALID_DASHBOARD_RANGE', 400);
    }
    const range = raw === '30d' ? '30d' : '7d';
    return getEvidencePlatformRuntime().operationsRepository.getDashboard(
      range
    );
  });
}
