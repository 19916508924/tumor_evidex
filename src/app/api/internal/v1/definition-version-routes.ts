import { z } from 'zod';

import {
  OperationsError,
  type DefinitionKind,
} from '@/shared/services/evidence-platform/operations';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

import { internalRoute, opsListQuery } from './route-helpers';

type DefinitionContext = {
  params: Promise<{ id: string; versionId?: string }>;
};

const createSchema = z
  .object({
    sourceVersionId: z.string().trim().min(1),
    version: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  })
  .strict();
const updateSchema = z
  .object({ patch: z.record(z.string(), z.unknown()) })
  .strict();
const evaluateSchema = z
  .object({ suiteId: z.string().trim().min(1).optional() })
  .strict();
const emptySchema = z.object({}).strict();
const rollbackSchema = z
  .object({ reason: z.string().trim().min(3).max(2_000) })
  .strict();

export async function createDefinitionVersionRoute(
  kind: DefinitionKind,
  request: Request,
  context: DefinitionContext
) {
  return internalRoute(
    request,
    async (actor) => {
      const body = await definitionBody(request, createSchema);
      return getEvidencePlatformRuntime().operationsRepository.createDefinitionDraft(
        {
          kind,
          definitionId: (await context.params).id,
          ...body,
          actorId: actor.id,
        }
      );
    },
    { mutation: true, successStatus: 201 }
  );
}

export async function updateDefinitionVersionRoute(
  kind: DefinitionKind,
  request: Request,
  context: DefinitionContext
) {
  return internalRoute(
    request,
    async (actor) => {
      const parameters = await context.params;
      const body = await definitionBody(request, updateSchema);
      return getEvidencePlatformRuntime().operationsRepository.updateDefinitionDraft(
        {
          kind,
          definitionId: parameters.id,
          versionId: requiredVersionId(parameters),
          patch: body.patch,
          actorId: actor.id,
        }
      );
    },
    { mutation: true }
  );
}

export async function evaluateDefinitionVersionRoute(
  kind: DefinitionKind,
  request: Request,
  context: DefinitionContext
) {
  return internalRoute(
    request,
    async (actor) => {
      const parameters = await context.params;
      const body = await definitionBody(request, evaluateSchema, true);
      return getEvidencePlatformRuntime().operationsRepository.evaluateDefinitionDraft(
        {
          kind,
          definitionId: parameters.id,
          versionId: requiredVersionId(parameters),
          suiteId: body.suiteId,
          actorId: actor.id,
        }
      );
    },
    { mutation: true }
  );
}

export async function activateDefinitionVersionRoute(
  kind: DefinitionKind,
  request: Request,
  context: DefinitionContext
) {
  return internalRoute(
    request,
    async (actor) => {
      const parameters = await context.params;
      await definitionBody(request, emptySchema, true);
      return getEvidencePlatformRuntime().operationsRepository.activateDefinitionVersion(
        {
          kind,
          definitionId: parameters.id,
          versionId: requiredVersionId(parameters),
          actorId: actor.id,
        }
      );
    },
    { mutation: true }
  );
}

export async function rollbackDefinitionVersionRoute(
  kind: DefinitionKind,
  request: Request,
  context: DefinitionContext
) {
  return internalRoute(
    request,
    async (actor) => {
      const parameters = await context.params;
      const body = await definitionBody(request, rollbackSchema);
      return getEvidencePlatformRuntime().operationsRepository.rollbackDefinitionVersion(
        {
          kind,
          definitionId: parameters.id,
          versionId: requiredVersionId(parameters),
          reason: body.reason,
          actorId: actor.id,
        }
      );
    },
    { mutation: true }
  );
}

export async function definitionAuditRoute(
  kind: DefinitionKind,
  request: Request,
  context: DefinitionContext
) {
  return internalRoute(request, async () => {
    const { page, pageSize } = opsListQuery(request);
    return getEvidencePlatformRuntime().operationsRepository.listDefinitionAudit(
      {
        kind,
        definitionId: (await context.params).id,
        page,
        pageSize,
      }
    );
  });
}

async function definitionBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  allowEmpty = false
): Promise<z.infer<T>> {
  try {
    const text = await request.text();
    const value = text.trim() ? JSON.parse(text) : allowEmpty ? {} : null;
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    throw new OperationsError('INVALID_DEFINITION_INPUT', 422, {
      issues: result.error.issues,
    });
  } catch (error) {
    if (error instanceof OperationsError) throw error;
    throw new OperationsError('INVALID_DEFINITION_INPUT', 422);
  }
}

function requiredVersionId(parameters: { versionId?: string }) {
  if (!parameters.versionId) throw new Error('versionId is required');
  return parameters.versionId;
}
