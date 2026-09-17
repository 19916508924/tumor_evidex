import {
  searchKnowledge,
  type KnowledgeEntityType,
} from '@/shared/services/evidence-platform/knowledge-catalog';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';

export async function listKnowledgeEntities(
  request: Request,
  type: KnowledgeEntityType
) {
  const parameters = new URL(request.url).searchParams;
  try {
    const data = await searchKnowledge({
      repository: getEvidencePlatformRuntime().catalogRepository,
      releaseVersion: parameters.get('release')?.trim() || undefined,
      type,
      query: parameters.get('q') ?? '',
      diseaseId: parameters.get('diseaseId')?.trim() || undefined,
      geneId: parameters.get('geneId')?.trim() || undefined,
      direction: directionParameter(parameters.get('direction')),
      level: levelParameter(parameters.get('level')),
      page: numberParameter(parameters.get('page')),
      pageSize: numberParameter(parameters.get('pageSize')),
    });
    return Response.json({ code: 0, message: 'ok', data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const invalid = /page|pageSize|direction|level/i.test(message);
    if (!invalid) console.error(`Knowledge ${type} list failed`, error);
    return Response.json(
      {
        code: -1,
        message: invalid
          ? 'INVALID_PAGINATION'
          : 'KNOWLEDGE_RELEASE_UNAVAILABLE',
      },
      { status: invalid ? 400 : 503 }
    );
  }
}

function directionParameter(value: string | null) {
  if (!value) return undefined;
  if (!['SENSITIVITY', 'RESISTANCE', 'EXPLORATORY'].includes(value)) {
    throw new Error('direction is invalid');
  }
  return value as 'SENSITIVITY' | 'RESISTANCE' | 'EXPLORATORY';
}

function levelParameter(value: string | null) {
  if (!value) return undefined;
  if (!['1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED'].includes(value)) {
    throw new Error('level is invalid');
  }
  return value;
}

function numberParameter(value: string | null) {
  if (value === null || value.trim() === '') return undefined;
  return Number(value);
}
