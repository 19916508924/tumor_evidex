import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { dbPostgres } from '@/core/db';
import { rateLimitBucket } from '@/config/db/schema';
import { md5 } from '@/shared/lib/hash';

export type MinIntervalStore = {
  claim(input: {
    key: string;
    now: Date;
    intervalMs: number;
  }): Promise<{ allowed: boolean; retryAfterMs: number }>;
};

type MinIntervalOptions = {
  intervalMs: number;
  keyPrefix?: string;
  extraKey?: string;
  store?: MinIntervalStore;
  now?: () => Date;
};

function getClientIpFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || '';
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    ''
  );
}

function buildKey(request: Request, opts: MinIntervalOptions): string {
  const url = new URL(request.url);
  const ip = getClientIpFromRequest(request);
  const cookie = request.headers.get('cookie') || '';
  const cookieHash = cookie ? md5(cookie) : 'no-cookie';
  const prefix = opts.keyPrefix || 'min-interval';
  const extra = opts.extraKey ? `|${opts.extraKey}` : '';
  return createHash('sha256')
    .update(
      `${prefix}|${request.method}|${url.pathname}|${ip}|${cookieHash}${extra}`
    )
    .digest('hex');
}

export function createPostgresMinIntervalStore(
  getDatabase: () => {
    transaction(operation: (transaction: any) => unknown): Promise<any>;
  } = dbPostgres
): MinIntervalStore {
  return {
    async claim(input) {
      const database = getDatabase();
      return database.transaction(async (transaction: any) => {
        const inserted = await transaction
          .insert(rateLimitBucket)
          .values({ key: input.key, acceptedAt: input.now })
          .onConflictDoNothing()
          .returning({ acceptedAt: rateLimitBucket.acceptedAt });
        if (inserted.length) return { allowed: true, retryAfterMs: 0 };
        const rows = await transaction
          .select({ acceptedAt: rateLimitBucket.acceptedAt })
          .from(rateLimitBucket)
          .where(eq(rateLimitBucket.key, input.key))
          .for('update')
          .limit(1);
        const acceptedAt = rows[0]
          ? new Date(rows[0].acceptedAt).getTime()
          : Number.NEGATIVE_INFINITY;
        const current = input.now.getTime();
        const delta = current - acceptedAt;
        if (delta >= 0 && delta < input.intervalMs) {
          return {
            allowed: false,
            retryAfterMs: input.intervalMs - delta,
          };
        }
        await transaction
          .update(rateLimitBucket)
          .set({ acceptedAt: input.now })
          .where(eq(rateLimitBucket.key, input.key));
        return { allowed: true, retryAfterMs: 0 };
      });
    },
  };
}

const postgresStore = createPostgresMinIntervalStore();

let testStore: MinIntervalStore | undefined;

export function setMinIntervalStoreForTests(store?: MinIntervalStore) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Rate-limit store override is test-only');
  }
  testStore = store;
}

export async function enforceMinIntervalRateLimit(
  request: Request,
  opts: MinIntervalOptions
): Promise<Response | null> {
  const intervalMs = Math.max(0, Number(opts.intervalMs) || 0);
  if (!intervalMs) return null;
  const decision = await (opts.store ?? testStore ?? postgresStore).claim({
    key: buildKey(request, opts),
    now: (opts.now ?? (() => new Date()))(),
    intervalMs,
  });
  if (decision.allowed) return null;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(decision.retryAfterMs / 1000)
  );
  return Response.json(
    {
      error: 'too_many_requests',
      message: `Please retry after ${retryAfterSeconds}s.`,
    },
    {
      status: 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': String(retryAfterSeconds),
      },
    }
  );
}

export function createMemoryMinIntervalStore(): MinIntervalStore {
  const values = new Map<string, number>();
  return {
    async claim(input) {
      const current = input.now.getTime();
      const last = values.get(input.key);
      if (typeof last === 'number') {
        const delta = current - last;
        if (delta >= 0 && delta < input.intervalMs) {
          return {
            allowed: false,
            retryAfterMs: input.intervalMs - delta,
          };
        }
      }
      values.set(input.key, current);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
