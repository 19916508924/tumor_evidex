import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';

function request(path = '/api/example', headers: HeadersInit = {}) {
  return new Request(`http://localhost${path}`, { method: 'POST', headers });
}

describe('minimum request interval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    globalThis.__minIntervalRateLimitStore = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.__minIntervalRateLimitStore;
  });

  it('accepts the first request and rejects a burst with a retry hint', async () => {
    delete globalThis.__minIntervalRateLimitStore;
    const options = { intervalMs: 1500 };
    expect(enforceMinIntervalRateLimit(request(), options)).toBeNull();
    const response = enforceMinIntervalRateLimit(request(), options)!;
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'too_many_requests',
      message: 'Please retry after 2s.',
    });
  });

  it('does not extend the cooldown when a request is rejected', () => {
    const options = { intervalMs: 1000 };
    enforceMinIntervalRateLimit(request(), options);
    vi.advanceTimersByTime(999);
    expect(enforceMinIntervalRateLimit(request(), options)?.status).toBe(429);
    vi.advanceTimersByTime(1);
    expect(enforceMinIntervalRateLimit(request(), options)).toBeNull();
  });

  it.each([0, -1, Number.NaN])(
    'disables limiting for interval %s',
    (intervalMs) => {
      expect(enforceMinIntervalRateLimit(request(), { intervalMs })).toBeNull();
      expect(enforceMinIntervalRateLimit(request(), { intervalMs })).toBeNull();
      expect(globalThis.__minIntervalRateLimitStore?.size).toBe(0);
    }
  );

  it.each(['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'])(
    'isolates clients using %s',
    (header) => {
      const options = { intervalMs: 1000 };
      enforceMinIntervalRateLimit(
        request('/', { [header]: '192.0.2.1' }),
        options
      );
      expect(
        enforceMinIntervalRateLimit(
          request('/', { [header]: '192.0.2.2' }),
          options
        )
      ).toBeNull();
    }
  );

  it('uses the first forwarded address regardless of proxy hops', () => {
    const options = { intervalMs: 1000 };
    enforceMinIntervalRateLimit(
      request('/', { 'x-forwarded-for': '192.0.2.1, proxy-a' }),
      options
    );
    expect(
      enforceMinIntervalRateLimit(
        request('/', { 'x-forwarded-for': '192.0.2.1, proxy-b' }),
        options
      )?.status
    ).toBe(429);
  });

  it('isolates sessions, paths, methods, namespaces and extra keys', () => {
    const options = { intervalMs: 1000 };
    enforceMinIntervalRateLimit(request(), options);
    expect(
      enforceMinIntervalRateLimit(request('/api/other'), options)
    ).toBeNull();
    expect(
      enforceMinIntervalRateLimit(
        request('/api/example', { cookie: 'session=other' }),
        options
      )
    ).toBeNull();
    expect(
      enforceMinIntervalRateLimit(
        new Request('http://localhost/api/example'),
        options
      )
    ).toBeNull();
    expect(
      enforceMinIntervalRateLimit(request(), { ...options, keyPrefix: 'other' })
    ).toBeNull();
    expect(
      enforceMinIntervalRateLimit(request(), { ...options, extraKey: 'user-2' })
    ).toBeNull();
  });

  it('recovers when the clock moves backwards', () => {
    enforceMinIntervalRateLimit(request(), { intervalMs: 1000 });
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    expect(
      enforceMinIntervalRateLimit(request(), { intervalMs: 1000 })
    ).toBeNull();
  });
});
