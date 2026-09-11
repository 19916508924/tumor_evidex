import { answerEvidenceQuery } from '@/shared/services/evidence/answer-evidence-query';
import { getEvidenceAnswerDependencies } from '@/shared/services/evidence/runtime';

export const runtime = 'nodejs';

const maxPayloadBytes = 64 * 1024;

function errorResponse(message: string, status: number, details?: unknown) {
  return Response.json(
    {
      code: -1,
      message,
      ...(details === undefined ? {} : { details }),
    },
    { status }
  );
}

export async function POST(request: Request) {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxPayloadBytes) {
    return errorResponse('PAYLOAD_TOO_LARGE', 413);
  }

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return errorResponse('INVALID_INPUT', 400);
  }

  let result;
  try {
    result = await answerEvidenceQuery(input, getEvidenceAnswerDependencies());
  } catch (error) {
    console.error('Failed to initialize Evidex evidence answer runtime', error);
    return errorResponse('KNOWLEDGE_RELEASE_UNAVAILABLE', 500);
  }

  if (result.status === 'INVALID_INPUT') {
    return errorResponse('INVALID_INPUT', 400, result.issues);
  }
  if (result.status === 'KNOWLEDGE_RELEASE_UNAVAILABLE') {
    return errorResponse('KNOWLEDGE_RELEASE_UNAVAILABLE', 500);
  }

  return Response.json({ code: 0, message: 'ok', data: result });
}
