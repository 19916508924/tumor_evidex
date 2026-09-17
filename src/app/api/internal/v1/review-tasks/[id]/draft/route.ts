import { z } from 'zod';

import { OperationsError } from '@/shared/services/evidence-platform/operations';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';
import { parseEvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

import { internalRoute } from '../../../route-helpers';

export const runtime = 'nodejs';

const inputSchema = z
  .object({
    expectedDraftVersion: z.number().int().positive(),
    draft: z.unknown(),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return internalRoute(
    request,
    async (actor) => {
      let value: unknown;
      try {
        value = await request.json();
      } catch {
        throw new OperationsError('INVALID_INPUT', 400);
      }
      const parsed = inputSchema.safeParse(value);
      if (!parsed.success) {
        throw new OperationsError('INVALID_INPUT', 400, parsed.error.issues);
      }
      let draft;
      try {
        draft = parseEvidenceDraftInput(parsed.data.draft);
      } catch (error) {
        throw new OperationsError('INVALID_EVIDENCE_DRAFT', 400, {
          issues:
            error && typeof error === 'object' && 'issues' in error
              ? error.issues
              : [
                  {
                    message:
                      error instanceof Error ? error.message : 'Invalid draft',
                  },
                ],
        });
      }
      const { id } = await context.params;
      return getEvidencePlatformRuntime().operationsRepository.updateReviewDraft(
        {
          reviewTaskId: id,
          expectedDraftVersion: parsed.data.expectedDraftVersion,
          draft,
          reason: parsed.data.reason,
          actorId: actor.id,
        }
      );
    },
    { mutation: true }
  );
}
