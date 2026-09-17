import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryMinIntervalStore,
  createPostgresMinIntervalStore,
  enforceMinIntervalRateLimit,
  setMinIntervalStoreForTests,
  type MinIntervalStore,
} from '@/shared/lib/rate-limit';

function request(path = '/api/example', headers: HeadersInit = {}) {
  return new Request(`http://localhost${path}`, { method: 'POST', headers });
}

describe('minimum request interval', () => {
  let store: MinIntervalStore;
  const limit = (
    value: Request,
    options: { intervalMs: number } & Record<string, unknown>
  ) => enforceMinIntervalRateLimit(value, { ...options, store });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    store = createMemoryMinIntervalStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts the first request and rejects a burst with a retry hint', async () => {
    const options = { intervalMs: 1500 };
    expect(await limit(request(), options)).toBeNull();
    const response = (await limit(request(), options))!;
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('2');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'too_many_requests',
      message: 'Please retry after 2s.',
    });
  });

  it('does not extend the cooldown when a request is rejected', async () => {
    const options = { intervalMs: 1000 };
    await limit(request(), options);
    vi.advanceTimersByTime(999);
    expect((await limit(request(), options))?.status).toBe(429);
    vi.advanceTimersByTime(1);
    expect(await limit(request(), options)).toBeNull();
  });

  it.each([0, -1, Number.NaN])(
    'disables limiting for interval %s',
    async (intervalMs) => {
      const claim = vi.spyOn(store, 'claim');
      expect(await limit(request(), { intervalMs })).toBeNull();
      expect(await limit(request(), { intervalMs })).toBeNull();
      expect(claim).not.toHaveBeenCalled();
    }
  );

  it.each(['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip'])(
    'isolates clients using %s',
    async (header) => {
      const options = { intervalMs: 1000 };
      await limit(request('/', { [header]: '192.0.2.1' }), options);
      expect(
        await limit(request('/', { [header]: '192.0.2.2' }), options)
      ).toBeNull();
    }
  );

  it('uses the first forwarded address regardless of proxy hops', async () => {
    const options = { intervalMs: 1000 };
    await limit(
      request('/', { 'x-forwarded-for': '192.0.2.1, proxy-a' }),
      options
    );
    expect(
      (
        await limit(
          request('/', { 'x-forwarded-for': '192.0.2.1, proxy-b' }),
          options
        )
      )?.status
    ).toBe(429);
  });

  it('isolates sessions, paths, methods, namespaces and extra keys', async () => {
    const options = { intervalMs: 1000 };
    await limit(request(), options);
    expect(await limit(request('/api/other'), options)).toBeNull();
    expect(
      await limit(request('/api/example', { cookie: 'session=other' }), options)
    ).toBeNull();
    expect(
      await limit(new Request('http://localhost/api/example'), options)
    ).toBeNull();
    expect(
      await limit(request(), { ...options, keyPrefix: 'other' })
    ).toBeNull();
    expect(
      await limit(request(), { ...options, extraKey: 'user-2' })
    ).toBeNull();
  });

  it('recovers when the clock moves backwards', async () => {
    await limit(request(), { intervalMs: 1000 });
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    expect(await limit(request(), { intervalMs: 1000 })).toBeNull();
  });

  it.each([
    {
      name: 'accepts a newly inserted bucket',
      inserted: [{ acceptedAt: new Date('2026-01-01T00:00:00Z') }],
      rows: [],
      expected: { allowed: true, retryAfterMs: 0 },
      updated: false,
    },
    {
      name: 'rejects a bucket inside the cooldown',
      inserted: [],
      rows: [{ acceptedAt: new Date('2025-12-31T23:59:59.500Z') }],
      expected: { allowed: false, retryAfterMs: 500 },
      updated: false,
    },
    {
      name: 'renews an expired bucket',
      inserted: [],
      rows: [{ acceptedAt: new Date('2025-12-31T23:59:58Z') }],
      expected: { allowed: true, retryAfterMs: 0 },
      updated: true,
    },
    {
      name: 'repairs a missing bucket after an insert race',
      inserted: [],
      rows: [],
      expected: { allowed: true, retryAfterMs: 0 },
      updated: true,
    },
  ])('$name with the PostgreSQL transaction store', async (fixture) => {
    const returning = vi.fn().mockResolvedValue(fixture.inserted);
    const insert = vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning })),
      })),
    }));
    const limitRows = vi.fn().mockResolvedValue(fixture.rows);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => ({ limit: limitRows })),
        })),
      })),
    }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    }));
    const transaction = vi.fn(async (operation) =>
      operation({ insert, select, update })
    );
    const postgresStore = createPostgresMinIntervalStore(() => ({
      transaction,
    }));

    await expect(
      postgresStore.claim({
        key: 'hashed-key',
        now: new Date('2026-01-01T00:00:00Z'),
        intervalMs: 1000,
      })
    ).resolves.toEqual(fixture.expected);
    expect(update).toHaveBeenCalledTimes(fixture.updated ? 1 : 0);
  });

  it('uses a test-wide shared store when no request-local store is supplied', async () => {
    const shared = createMemoryMinIntervalStore();
    setMinIntervalStoreForTests(shared);
    const options = { intervalMs: 1000, now: () => new Date() };
    expect(await enforceMinIntervalRateLimit(request(), options)).toBeNull();
    expect(
      (await enforceMinIntervalRateLimit(request(), options))?.status
    ).toBe(429);
    setMinIntervalStoreForTests(undefined);
  });

  it('rejects attempts to replace the production rate-limit store', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => setMinIntervalStoreForTests(store)).toThrow(/test-only/);
    vi.unstubAllEnvs();
  });
});
