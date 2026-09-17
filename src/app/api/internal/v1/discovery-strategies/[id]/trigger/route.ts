import { z } from 'zod';

import { OperationsError } from '@/shared/services/evidence-platform/operations';

import { internalRoute } from '../../../route-helpers';

export const runtime = 'nodejs';

const inputSchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return internalRoute(
    request,
    async (actor) => {
      await context.params;
      const raw = await request.text();
      let value: unknown;
      try {
        value = raw ? JSON.parse(raw) : {};
      } catch {
        throw new OperationsError('INVALID_INPUT', 400);
      }
      const parsed = inputSchema.safeParse(value);
      if (!parsed.success) {
        throw new OperationsError('INVALID_INPUT', 400, parsed.error.issues);
      }
      void actor;
      void parsed;
      throw new OperationsError('USE_DISCOVERY_RUN_PREVIEW', 410, {
        preview: '/api/internal/v1/discovery-runs/preview',
        create: '/api/internal/v1/discovery-runs',
      });
    },
    { mutation: true, successStatus: 202 }
  );
}
