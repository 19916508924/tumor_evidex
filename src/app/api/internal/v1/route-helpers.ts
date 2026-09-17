import {
  parsePageParameters,
  PlatformApiError,
  requireInternalActor,
  respondToError,
  success,
} from '@/shared/services/evidence-platform/http';
import { OperationsError } from '@/shared/services/evidence-platform/operations';
import type { OpsListQuery } from '@/shared/types/evidence-platform-api';

export async function internalRoute<T>(
  request: Request,
  handler: (actor: { id: string; email: string; name: string }) => Promise<T>,
  options: { mutation?: boolean; successStatus?: number } = {}
) {
  try {
    const actor = await requireInternalActor(
      options.mutation ? request : undefined
    );
    const data = await handler(actor);
    return success(data, { status: options.successStatus ?? 200 });
  } catch (error) {
    if (error instanceof OperationsError) {
      return Response.json(
        {
          code: -1,
          message: error.code,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
        { status: error.status }
      );
    }
    if (error instanceof PlatformApiError) {
      return respondToError(error, 'INTERNAL_API_FAILED');
    }
    return respondToError(error, 'INTERNAL_API_FAILED');
  }
}

export function opsListQuery(request: Request): OpsListQuery {
  const parameters = new URL(request.url).searchParams;
  const { page, pageSize } = parsePageParameters(parameters);
  const from = dateParameter(parameters.get('from'), 'from');
  const to = dateParameter(parameters.get('to'), 'to');
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    throw new PlatformApiError('INVALID_DATE_RANGE', 400);
  }
  return {
    page,
    pageSize,
    q: parameters.get('q')?.trim() || undefined,
    status: parameters.get('status')?.trim() || undefined,
    from,
    to,
    ...reviewFilters(parameters),
  };
}

function reviewFilters(parameters: URLSearchParams) {
  const waitingAge = parameters.get('waitingAge')?.trim() || undefined;
  const risk = parameters.get('risk')?.trim() || undefined;
  const blockingValue = parameters.get('blocking')?.trim() || undefined;
  if (waitingAge && !['24h', '72h', '7d'].includes(waitingAge)) {
    throw new PlatformApiError('INVALID_REVIEW_FILTER', 400, {
      field: 'waitingAge',
    });
  }
  if (risk && !['LOW', 'MEDIUM', 'HIGH'].includes(risk)) {
    throw new PlatformApiError('INVALID_REVIEW_FILTER', 400, { field: 'risk' });
  }
  if (blockingValue && !['true', 'false'].includes(blockingValue)) {
    throw new PlatformApiError('INVALID_REVIEW_FILTER', 400, {
      field: 'blocking',
    });
  }
  return {
    waitingAge: waitingAge as OpsListQuery['waitingAge'],
    diseaseId: parameters.get('diseaseId')?.trim() || undefined,
    geneId: parameters.get('geneId')?.trim() || undefined,
    variantId: parameters.get('variantId')?.trim() || undefined,
    risk: risk as OpsListQuery['risk'],
    blocking:
      blockingValue === undefined ? undefined : blockingValue === 'true',
  };
}

function dateParameter(value: string | null, field: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PlatformApiError('INVALID_DATE', 400, { field });
  }
  return date.toISOString();
}
