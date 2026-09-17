import { describe, expect, it, vi } from 'vitest';

import {
  getKnowledgeEntityDetail,
  getKnowledgeEvidenceDetail,
  getKnowledgeSourceDetail,
  getKnowledgeSummary,
  searchKnowledge,
  type KnowledgeCatalogRepository,
} from '@/shared/services/evidence-platform/knowledge-catalog';

const release = {
  id: 'release-v1',
  version: 'v1.0.0',
  literatureCutoffAt: '2026-09-15T00:00:00.000Z',
  regulatoryCutoffAt: '2026-09-15T00:00:00.000Z',
  publishedAt: '2026-09-15T01:00:00.000Z',
};

function repository(
  releaseResult: typeof release | null = release
): KnowledgeCatalogRepository {
  return {
    getRelease: vi.fn().mockResolvedValue(releaseResult),
    countPublished: vi.fn().mockResolvedValue({
      diseases: 2,
      genes: 2,
      variants: 5,
      drugs: 9,
      associations: 11,
      claims: 20,
      sources: 22,
    }),
    searchPublished: vi.fn().mockResolvedValue([
      {
        id: 'variant-egfr-l858r',
        type: 'variant',
        canonicalName: 'EGFR p.L858R',
        displayNameZh: 'EGFR p.L858R',
        displayNameEn: 'EGFR p.L858R',
        aliases: ['L858R'],
      },
      {
        id: 'gene-egfr',
        type: 'gene',
        canonicalName: 'EGFR',
        displayNameZh: 'EGFR',
        displayNameEn: 'EGFR',
        aliases: ['ERBB1'],
      },
    ]),
    getEntityDetail: vi.fn().mockResolvedValue(null),
    getEvidenceDetail: vi.fn().mockResolvedValue(null),
    getSourceDetail: vi.fn().mockResolvedValue(null),
    listRecentReleases: vi.fn().mockResolvedValue([release]),
  };
}

describe('published knowledge catalog', () => {
  it('reports counts and cutoffs from one locked release', async () => {
    const store = repository();
    await expect(getKnowledgeSummary({ repository: store })).resolves.toEqual({
      release,
      counts: {
        diseases: 2,
        genes: 2,
        variants: 5,
        drugs: 9,
        associations: 11,
        claims: 20,
        sources: 22,
      },
      recentReleases: [release],
    });
    expect(store.countPublished).toHaveBeenCalledWith('release-v1');
  });

  it('paginates a stable repository result and preserves release identity', async () => {
    const store = repository();
    await expect(
      searchKnowledge({
        repository: store,
        releaseVersion: 'v1.0.0',
        query: 'egfr',
        page: 2,
        pageSize: 1,
      })
    ).resolves.toEqual({
      release,
      items: [expect.objectContaining({ id: 'variant-egfr-l858r' })],
      pagination: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
    });
    expect(store.getRelease).toHaveBeenCalledWith('v1.0.0');
    expect(store.searchPublished).toHaveBeenCalledWith({
      releaseId: 'release-v1',
      query: 'egfr',
      type: undefined,
    });
  });

  it('rejects invalid pagination and unavailable releases', async () => {
    await expect(
      searchKnowledge({ repository: repository(), page: 0 })
    ).rejects.toThrow(/page/i);
    await expect(
      searchKnowledge({ repository: repository(), pageSize: 101 })
    ).rejects.toThrow(/pageSize/i);
    await expect(
      getKnowledgeSummary({ repository: repository(null) })
    ).rejects.toThrow(/release/i);
  });

  it('release-locks entity, evidence, and source details', async () => {
    const store = repository();
    vi.mocked(store.getEntityDetail).mockResolvedValue({
      entity: {
        id: 'variant-egfr-l858r',
        type: 'variant',
        canonicalName: 'EGFR p.L858R',
        displayNameZh: 'EGFR p.L858R',
        displayNameEn: 'EGFR p.L858R',
        aliases: ['L858R'],
      },
      associations: [],
      related: { diseases: [], genes: [], variants: [], drugs: [] },
    });
    vi.mocked(store.getEvidenceDetail).mockResolvedValue({
      claim: {
        id: 'claim-1',
        claimType: 'EFFICACY',
        evidenceMaturity: 'MATURE_CLINICAL',
        studyType: 'trial',
        studyName: null,
        populationSummary: 'NSCLC',
        sampleSize: 20,
        diseaseStage: null,
        treatmentLine: null,
        priorTherapy: null,
        intervention: 'osimertinib',
        comparator: null,
        endpoint: 'response',
        effectValue: null,
        conclusion: 'Response observed.',
        limitations: 'Small study.',
      },
      association: {} as never,
      passages: [],
    });
    vi.mocked(store.getSourceDetail).mockResolvedValue({
      source: {
        id: 'source-1',
        sourceType: 'PUBMED',
        externalId: '12345678',
        title: 'Study',
        publisherOrAgency: null,
        journal: 'Journal',
        publicationDate: '2026-09-01',
        doi: null,
        pmcid: null,
        url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
        sourceScope: 'ABSTRACT',
        language: 'en',
      },
      passages: [],
      evidenceClaimIds: ['claim-1'],
      regulatoryApprovalIds: [],
    });

    await expect(
      getKnowledgeEntityDetail({
        repository: store,
        releaseVersion: release.version,
        type: 'variant',
        id: 'variant-egfr-l858r',
      })
    ).resolves.toMatchObject({
      release,
      entity: { id: 'variant-egfr-l858r' },
    });
    await expect(
      getKnowledgeEvidenceDetail({
        repository: store,
        id: 'claim-1',
      })
    ).resolves.toMatchObject({ release, claim: { id: 'claim-1' } });
    await expect(
      getKnowledgeSourceDetail({ repository: store, id: 'source-1' })
    ).resolves.toMatchObject({ release, source: { id: 'source-1' } });
    expect(store.getEntityDetail).toHaveBeenCalledWith({
      releaseId: release.id,
      type: 'variant',
      id: 'variant-egfr-l858r',
    });
  });

  it('returns null when a release contains no requested detail', async () => {
    const store = repository();
    await expect(
      getKnowledgeEntityDetail({
        repository: store,
        type: 'drug',
        id: 'missing',
      })
    ).resolves.toBeNull();
    await expect(
      getKnowledgeEvidenceDetail({ repository: store, id: 'missing' })
    ).resolves.toBeNull();
    await expect(
      getKnowledgeSourceDetail({ repository: store, id: 'missing' })
    ).resolves.toBeNull();
  });
});
