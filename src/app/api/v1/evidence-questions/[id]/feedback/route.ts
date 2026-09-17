import { randomUUID } from 'node:crypto';

import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import { failure, success } from '@/shared/services/evidence-platform/http';
import {
  createQuestionFeedback,
  QuestionFeedbackError,
} from '@/shared/services/evidence-platform/question-workflow';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const limited = await enforceMinIntervalRateLimit(request, {
    intervalMs: Number(process.env.EVIDEX_FEEDBACK_MIN_INTERVAL_MS || 1_000),
    keyPrefix: 'evidex-question-feedback',
  });
  if (limited) {
    return failure('RATE_LIMITED', 429, undefined, {
      'cache-control': 'no-store',
      'retry-after': limited.headers.get('retry-after') || '1',
    });
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 8 * 1024) {
    return failure('PAYLOAD_TOO_LARGE', 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return failure('INVALID_FEEDBACK', 400);
  }
  const { id } = await context.params;
  try {
    const data = await createQuestionFeedback({
      questionRunId: id,
      value,
      idempotencyKey:
        request.headers.get('idempotency-key')?.trim() ||
        `feedback:${randomUUID()}`,
      dependencies: getEvidencePlatformRuntime().questionDependencies,
    });
    return success(data, { status: data.idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof QuestionFeedbackError) {
      const status =
        error.code === 'QUESTION_RUN_NOT_FOUND'
          ? 404
          : error.code === 'QUESTION_RUN_NOT_COMPLETED'
            ? 409
            : 400;
      return failure(error.code, status);
    }
    console.error('Question feedback failed', error);
    return failure('FEEDBACK_WRITE_FAILED', 500);
  }
}
