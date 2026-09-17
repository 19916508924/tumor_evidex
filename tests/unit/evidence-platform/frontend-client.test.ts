import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isAbortError,
  ProductRequestError,
  requestProductData,
} from '@/shared/components/evidence-platform/client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('evidence platform frontend client', () => {
  it('returns data from a successful product response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 0, message: 'ok', data: { total: 2 } }),
            { status: 200 }
          )
        )
    );

    await expect(
      requestProductData<{ total: number }>('/api/example')
    ).resolves.toEqual({
      total: 2,
    });
  });

  it('preserves the stable error code and HTTP status from a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: -1, message: 'RATE_LIMITED' }), {
          status: 429,
        })
      )
    );

    const error = await requestProductData('/api/example').catch(
      (reason) => reason
    );

    expect(error).toBeInstanceOf(ProductRequestError);
    expect(error).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('rejects an unreadable response without pretending it is empty data', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<html>error</html>', { status: 502 }))
    );

    await expect(requestProductData('/api/example')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('distinguishes an aborted request from a real failure', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('network failed'))).toBe(false);
  });
});
