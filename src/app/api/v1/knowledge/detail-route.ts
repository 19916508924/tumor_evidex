import { failure, success } from '@/shared/services/evidence-platform/http';
import {
  getKnowledgeEntityDetail,
  getKnowledgeEvidenceDetail,
  getKnowledgeSourceDetail,
  type KnowledgeEntityType,
} from '@/shared/services/evidence-platform/knowledge-catalog';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export async function entityDetailResponse(
  request: Request,
  type: KnowledgeEntityType,
  id: string
) {
  const releaseVersion = releaseParameter(request);
  try {
    const data = await getKnowledgeEntityDetail({
      repository: getEvidencePlatformRuntime().catalogRepository,
      releaseVersion,
      type,
      id,
    });
    return data
      ? success(data)
      : failure('KNOWLEDGE_ENTITY_NOT_FOUND', 404, { type, id });
  } catch (error) {
    console.error('Knowledge entity detail failed', error);
    return failure('KNOWLEDGE_RELEASE_UNAVAILABLE', 503);
  }
}

export async function evidenceDetailResponse(request: Request, id: string) {
  try {
    const data = await getKnowledgeEvidenceDetail({
      repository: getEvidencePlatformRuntime().catalogRepository,
      releaseVersion: releaseParameter(request),
      id,
    });
    return data
      ? success(data)
      : failure('EVIDENCE_CLAIM_NOT_FOUND', 404, { id });
  } catch (error) {
    console.error('Knowledge evidence detail failed', error);
    return failure('KNOWLEDGE_RELEASE_UNAVAILABLE', 503);
  }
}

export async function sourceDetailResponse(request: Request, id: string) {
  try {
    const data = await getKnowledgeSourceDetail({
      repository: getEvidencePlatformRuntime().catalogRepository,
      releaseVersion: releaseParameter(request),
      id,
    });
    return data ? success(data) : failure('SOURCE_NOT_FOUND', 404, { id });
  } catch (error) {
    console.error('Knowledge source detail failed', error);
    return failure('KNOWLEDGE_RELEASE_UNAVAILABLE', 503);
  }
}

function releaseParameter(request: Request) {
  return new URL(request.url).searchParams.get('release')?.trim() || undefined;
}
