import type {
  KnowledgeEntityDetail,
  PublicEvidenceDetail,
  PublicSourceDetail,
} from '@/shared/types/evidence-platform-api';

export type KnowledgeEntityType = 'disease' | 'gene' | 'variant' | 'drug';

export interface KnowledgeCatalogRelease {
  id: string;
  version: string;
  literatureCutoffAt: string;
  regulatoryCutoffAt: string;
  gradingRuleVersion?: string;
  publishedAt: string;
}

export interface KnowledgeCatalogItem {
  id: string;
  type: KnowledgeEntityType;
  canonicalName: string;
  displayNameZh: string;
  displayNameEn: string;
  aliases: string[];
}

export interface KnowledgeCatalogRepository {
  getRelease(version?: string): Promise<KnowledgeCatalogRelease | null>;
  countPublished(releaseId: string): Promise<{
    diseases: number;
    genes: number;
    variants: number;
    drugs: number;
    associations: number;
    claims: number;
    sources: number;
  }>;
  searchPublished(input: {
    releaseId: string;
    type?: KnowledgeEntityType;
    query: string;
    diseaseId?: string;
    geneId?: string;
    direction?: 'SENSITIVITY' | 'RESISTANCE' | 'EXPLORATORY';
    level?: string;
  }): Promise<KnowledgeCatalogItem[]>;
  getEntityDetail(input: {
    releaseId: string;
    type: KnowledgeEntityType;
    id: string;
  }): Promise<Omit<KnowledgeEntityDetail, 'release'> | null>;
  getEvidenceDetail(input: {
    releaseId: string;
    id: string;
  }): Promise<Omit<PublicEvidenceDetail, 'release'> | null>;
  getSourceDetail(input: {
    releaseId: string;
    id: string;
  }): Promise<Omit<PublicSourceDetail, 'release'> | null>;
  listRecentReleases(limit: number): Promise<KnowledgeCatalogRelease[]>;
}

export async function getKnowledgeSummary(_input: {
  repository: KnowledgeCatalogRepository;
  releaseVersion?: string;
}): Promise<unknown> {
  const release = await requireRelease(
    _input.repository,
    _input.releaseVersion
  );
  return {
    release,
    counts: await _input.repository.countPublished(release.id),
    recentReleases: await _input.repository.listRecentReleases(5),
  };
}

export async function searchKnowledge(_input: {
  repository: KnowledgeCatalogRepository;
  releaseVersion?: string;
  type?: KnowledgeEntityType;
  query?: string;
  diseaseId?: string;
  geneId?: string;
  direction?: 'SENSITIVITY' | 'RESISTANCE' | 'EXPLORATORY';
  level?: string;
  page?: number;
  pageSize?: number;
}): Promise<unknown> {
  const page = _input.page ?? 1;
  const pageSize = _input.pageSize ?? 20;
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('page must be a positive integer');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize must be an integer between 1 and 100');
  }

  const release = await requireRelease(
    _input.repository,
    _input.releaseVersion
  );
  const allItems = await _input.repository.searchPublished({
    releaseId: release.id,
    type: _input.type,
    query: (_input.query ?? '').trim(),
    diseaseId: _input.diseaseId,
    geneId: _input.geneId,
    direction: _input.direction,
    level: _input.level,
  });
  const sortedItems = [...allItems].sort(
    (left, right) =>
      left.canonicalName.localeCompare(right.canonicalName, 'en') ||
      left.type.localeCompare(right.type, 'en') ||
      left.id.localeCompare(right.id, 'en')
  );
  const offset = (page - 1) * pageSize;
  return {
    release,
    items: sortedItems.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      total: sortedItems.length,
      totalPages: Math.ceil(sortedItems.length / pageSize),
    },
  };
}

export async function getKnowledgeEntityDetail(_input: {
  repository: KnowledgeCatalogRepository;
  releaseVersion?: string;
  type: KnowledgeEntityType;
  id: string;
}): Promise<KnowledgeEntityDetail | null> {
  const release = await requireRelease(
    _input.repository,
    _input.releaseVersion
  );
  const detail = await _input.repository.getEntityDetail({
    releaseId: release.id,
    type: _input.type,
    id: _input.id,
  });
  return detail ? { release, ...detail } : null;
}

export async function getKnowledgeEvidenceDetail(_input: {
  repository: KnowledgeCatalogRepository;
  releaseVersion?: string;
  id: string;
}): Promise<PublicEvidenceDetail | null> {
  const release = await requireRelease(
    _input.repository,
    _input.releaseVersion
  );
  const detail = await _input.repository.getEvidenceDetail({
    releaseId: release.id,
    id: _input.id,
  });
  return detail ? { release, ...detail } : null;
}

export async function getKnowledgeSourceDetail(_input: {
  repository: KnowledgeCatalogRepository;
  releaseVersion?: string;
  id: string;
}): Promise<PublicSourceDetail | null> {
  const release = await requireRelease(
    _input.repository,
    _input.releaseVersion
  );
  const detail = await _input.repository.getSourceDetail({
    releaseId: release.id,
    id: _input.id,
  });
  return detail ? { release, ...detail } : null;
}

async function requireRelease(
  repository: KnowledgeCatalogRepository,
  releaseVersion?: string
) {
  const release = await repository.getRelease(releaseVersion);
  if (!release) throw new Error('Published knowledge release is unavailable');
  return release;
}
