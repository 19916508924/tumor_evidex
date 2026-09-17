import { enforceMinIntervalRateLimit } from '@/shared/lib/rate-limit';
import {
  QuestionRetryError,
  retryEvidenceQuestionRun,
} from '@/shared/services/evidence-platform/question-workflow';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const limited = await enforceMinIntervalRateLimit(request, {
    intervalMs: Number(process.env.EVIDEX_QUESTION_MIN_INTERVAL_MS || 1_000),
    keyPrefix: 'evidex-evidence-question-retry',
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
  const { id } = await context.params;
  try {
    const result = await retryEvidenceQuestionRun({
      questionRunId: id,
      dependencies: getEvidencePlatformRuntime().questionDependencies,
    });
    return Response.json(
      {
        code: 0,
        message: 'ok',
        data: {
          questionRunId: result.questionRunId,
          status: result.status,
          pollAfterMs: 1000,
          idempotent: !result.requeued,
        },
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof QuestionRetryError) {
      return Response.json(
        { code: -1, message: error.code },
        { status: error.code === 'QUESTION_RUN_NOT_FOUND' ? 404 : 409 }
      );
    }
    console.error('Evidence question retry failed', error);
    return Response.json(
      { code: -1, message: 'QUESTION_RUN_RETRY_FAILED' },
      { status: 500 }
    );
  }
}
