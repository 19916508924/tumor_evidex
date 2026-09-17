import { z } from 'zod';

import { previewDiscoveryRun } from '@/shared/services/evidence-platform/discovery-run';
import { OperationsError } from '@/shared/services/evidence-platform/operations';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute } from '../../route-helpers';

export const runtime = 'nodejs';

const scopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('ALL_KNOWLEDGE') }).strict(),
  z
    .object({
      mode: z.literal('SCOPED'),
      diseaseIds: z.array(z.string().trim().min(1).max(200)).max(100),
      geneIds: z.array(z.string().trim().min(1).max(200)).max(100),
      variantIds: z.array(z.string().trim().min(1).max(200)).max(100),
    })
    .strict(),
]);

const previewSchema = z
  .object({
    source: z.enum(['PUBMED', 'CIVIC']).optional(),
    scope: scopeSchema,
    documentLimit: z.union([z.literal(50), z.literal(100), z.literal('ALL')]),
    window: z
      .object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
      })
      .strict()
      .optional(),
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
      const parsed = previewSchema.safeParse(value);
      if (!parsed.success) {
        throw new OperationsError('INVALID_INPUT', 400, parsed.error.issues);
      }
      const platform = getEvidencePlatformRuntime();
      return previewDiscoveryRun({
        actorId: actor.id,
        request: parsed.data,
        repository: platform.discoveryRepository,
        pubmed: platform.pubmed,
        civic: platform.civic,
        secret: platform.previewSigningSecret,
      });
    },
    { mutation: true }
  );
}
