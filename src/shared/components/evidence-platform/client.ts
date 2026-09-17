export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export class ProductRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super(code);
    this.name = 'ProductRequestError';
  }
}

export async function requestProductData<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  let envelope: ApiEnvelope<T> | { code: number; message: string };
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ProductRequestError('INVALID_RESPONSE', response.status);
  }

  if (!response.ok || envelope.code !== 0 || !('data' in envelope)) {
    throw new ProductRequestError(envelope.message, response.status);
  }
  return envelope.data;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
