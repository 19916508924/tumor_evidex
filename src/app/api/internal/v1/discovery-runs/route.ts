import { z } from 'zod';

import { createDiscoveryRunFromPreview } from '@/shared/services/evidence-platform/discovery-run';
import { OperationsError } from '@/shared/services/evidence-platform/operations';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute, opsListQuery } from '../route-helpers';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return internalRoute(request, async () =>
    getEvidencePlatformRuntime().operationsRepository.listDiscoveryRuns(
      opsListQuery(request)
    )
  );
}

const createSchema = z
  .object({
    previewToken: z.string().min(1).max(100_000),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export async function POST(request: Request) {
  return internalRoute(
    request,
    async (actor) => {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        throw new OperationsError('INVALID_INPUT', 400);
      }
      const parsed = createSchema.safeParse(value);
      if (!parsed.success) {
        throw new OperationsError('INVALID_INPUT', 400, parsed.error.issues);
      }
      const platform = getEvidencePlatformRuntime();
      return createDiscoveryRunFromPreview({
        actorId: actor.id,
        previewToken: parsed.data.previewToken,
        idempotencyKey:
          parsed.data.idempotencyKey ||
          request.headers.get('idempotency-key') ||
          '',
        repository: platform.discoveryRepository,
        secret: platform.previewSigningSecret,
        workflowVersion:
          process.env.EVIDEX_DISCOVERY_WORKFLOW_VERSION ||
          'pubmed-discovery-v2',
      });
    },
    { mutation: true, successStatus: 202 }
  );
}
