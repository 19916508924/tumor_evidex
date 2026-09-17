import { randomUUID } from 'node:crypto';

import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import { submitEvidenceQuestion } from '@/shared/services/evidence-platform/question-workflow';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';
import type { QuestionRunSubmissionResult } from '@/shared/types/evidence-platform-api';

export const runtime = 'nodejs';

const maxPayloadBytes = 64 * 1024;

export async function POST(request: Request) {
  const limited = await enforceMinIntervalRateLimit(request, {
    intervalMs: Number(process.env.EVIDEX_QUESTION_MIN_INTERVAL_MS || 1_000),
    keyPrefix: 'evidex-evidence-questions',
  });
  if (limited) {
    return Response.json(
      { code: -1, message: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'cache-control': 'no-store',
          'retry-after': limited.headers.get('retry-after') || '1',
        },
      }
    );
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxPayloadBytes) {
    return Response.json(
      { code: -1, message: 'PAYLOAD_TOO_LARGE' },
      { status: 413 }
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return Response.json(
      { code: -1, message: 'INVALID_INPUT' },
      { status: 400 }
    );
  }
  const platform = getEvidencePlatformRuntime();
  try {
    const run = await submitEvidenceQuestion({
      value,
      idempotencyKey:
        request.headers.get('idempotency-key')?.trim() ||
        `question:${randomUUID()}`,
      dependencies: platform.questionDependencies,
    });
    return Response.json(
      {
        code: 0,
        message: 'ok',
        data: {
          questionRunId: run.id,
          status: run.status,
          pollAfterMs: 1000,
        } satisfies QuestionRunSubmissionResult,
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const invalid = /question input|idempotency key/i.test(message);
    if (!invalid) console.error('Evidence question submission failed', error);
    return Response.json(
      {
        code: -1,
        message: invalid ? 'INVALID_INPUT' : 'KNOWLEDGE_RELEASE_UNAVAILABLE',
      },
      { status: invalid ? 400 : 503 }
    );
  }
}
