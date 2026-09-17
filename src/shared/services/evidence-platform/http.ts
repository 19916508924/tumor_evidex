import { getCurrentUserWithPermission, PERMISSIONS } from '@/core/rbac';

export class PlatformApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(code);
    this.name = 'PlatformApiError';
  }
}

export function success<T>(data: T, init?: ResponseInit) {
  return Response.json({ code: 0, message: 'ok', data }, init);
}

export function failure(
  message: string,
  status: number,
  details?: unknown,
  headers?: HeadersInit
) {
  return Response.json(
    {
      code: -1,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status, headers }
  );
}

export function respondToError(error: unknown, fallback: string) {
  if (error instanceof PlatformApiError) {
    return failure(error.code, error.status, error.details);
  }
  console.error(fallback, error);
  return failure(fallback, 500);
}

export async function requireInternalActor(request?: Request) {
  if (request) assertTrustedMutationOrigin(request);
  const actor = await getCurrentUserWithPermission({
    code: PERMISSIONS.ADMIN_ACCESS,
  });
  if (!actor) {
    throw new PlatformApiError('AUTHENTICATION_REQUIRED', 401);
  }
  return actor;
}

export function assertTrustedMutationOrigin(request: Request) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const originUrl = safeUrl(origin);
  if (!originUrl || originUrl.origin !== requestUrl.origin) {
    throw new PlatformApiError('UNTRUSTED_ORIGIN', 403);
  }
}

export function parsePageParameters(parameters: URLSearchParams) {
  const page = numberParameter(parameters.get('page'), 1);
  const pageSize = numberParameter(parameters.get('pageSize'), 20);
  if (!Number.isInteger(page) || page < 1) {
    throw new PlatformApiError('INVALID_PAGINATION', 400, {
      field: 'page',
    });
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new PlatformApiError('INVALID_PAGINATION', 400, {
      field: 'pageSize',
    });
  }
  return { page, pageSize };
}

export function parseOptionalDate(value: string | null, field: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PlatformApiError('INVALID_DATE', 400, { field });
  }
  return date;
}

function numberParameter(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback;
  return Number(value);
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
