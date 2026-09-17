import {
  questionDisclaimer,
  questionDisclaimerEn,
} from '@/shared/services/evidence-platform/question-workflow';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';
import type {
  PublicQuestionProgress,
  PublicQuestionRunResponse,
} from '@/shared/types/evidence-platform-api';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const run =
    await getEvidencePlatformRuntime().questionDependencies.repository.get(id);
  if (!run) {
    return Response.json(
      { code: -1, message: 'QUESTION_RUN_NOT_FOUND' },
      { status: 404 }
    );
  }
  const data = {
    id: run.id,
    questionRunId: run.id,
    status: run.status,
    progress: progressForStatus(run.status, run.currentStep),
    pollAfterMs:
      run.status === 'PENDING' || run.status === 'RUNNING' ? 1000 : null,
    question: run.redactedQuestion,
    normalizedQuestion: run.interpretation,
    knowledgeRelease: run.knowledgeRelease,
    result: run.publicResult,
    disclaimer: questionDisclaimer,
    disclaimerEn: questionDisclaimerEn,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  } satisfies PublicQuestionRunResponse;
  return Response.json({
    code: 0,
    message: 'ok',
    data,
  });
}

function progressForStatus(
  status: string,
  currentStep?: string | null
): PublicQuestionProgress {
  if (status === 'PENDING') return 'UNDERSTANDING_QUESTION';
  if (status === 'RUNNING') {
    if (currentStep === 'compose_evidence_answer') return 'COMPOSING_ANSWER';
    if (currentStep === 'validate_answer') return 'VALIDATING_CITATIONS';
    if (currentStep === 'analyze_evidence') return 'ORGANIZING_EVIDENCE';
    return 'RETRIEVING_APPROVED_EVIDENCE';
  }
  return 'COMPLETED';
}
