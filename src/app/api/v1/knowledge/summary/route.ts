import { getKnowledgeSummary } from '@/shared/services/evidence-platform/knowledge-catalog';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const releaseVersion =
    new URL(request.url).searchParams.get('release')?.trim() || undefined;
  try {
    const data = await getKnowledgeSummary({
      repository: getEvidencePlatformRuntime().catalogRepository,
      releaseVersion,
    });
    return Response.json({ code: 0, message: 'ok', data });
  } catch (error) {
    console.error('Knowledge summary failed', error);
    return Response.json(
      { code: -1, message: 'KNOWLEDGE_RELEASE_UNAVAILABLE' },
      { status: 503 }
    );
  }
}
