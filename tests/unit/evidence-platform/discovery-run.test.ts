import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  createDiscoveryRunFromPreview,
  previewDiscoveryRun,
  type DiscoveryRunRepository,
} from '@/shared/services/evidence-platform/discovery-run';

function repository(): DiscoveryRunRepository {
  return {
    resolveDiscoveryScope: vi.fn().mockResolvedValue({
      snapshot: {
        mode: 'SCOPED',
        diseaseIds: ['disease_nsclc'],
        geneIds: ['gene_egfr'],
        variantIds: [],
        aliasVersion: 'catalog-v1',
        knowledgeReleaseId: 'release-1',
        knowledgeReleaseVersion: 'v0.2.0',
      },
      queries: [
        {
          strategyId: 'strategy-1',
          strategyVersion: '1.0.0',
          associationId: 'association-1',
          query: 'EGFR AND NSCLC',
          label: 'NSCLC · EGFR',
        },
      ],
      lastSuccessfulCutoffAt: null,
      overlapDays: 7,
    }),
    createManualDiscoveryRun: vi.fn().mockResolvedValue({
      run: { id: 'run-1', status: 'PENDING' },
      idempotent: false,
    }),
    transitionDiscoveryRun: vi.fn(),
    claimPlatformJob: vi.fn(),
    completePlatformJob: vi.fn(),
    failPlatformJob: vi.fn(),
    beginDiscoveryRun: vi.fn(),
    getDiscoveryRunStatus: vi.fn(),
    claimDiscoveryDocument: vi.fn(),
    recordDiscoveryDocumentOutcome: vi.fn(),
    attachCandidateToDiscoveryStrategy: vi.fn(),
    saveDiscoveryQueryProgress: vi.fn(),
    finishDiscoveryRun: vi.fn(),
  };
}

const request = {
  scope: {
    mode: 'SCOPED' as const,
    diseaseIds: ['disease_nsclc'],
    geneIds: ['gene_egfr'],
    variantIds: [],
  },
  documentLimit: 50 as const,
};

describe('manual Discovery Run preview and confirmation', () => {
  it('previews normalized scope without creating a run and signs an expiring token', async () => {
    const store = repository();
    const pubmed = {
      previewSearch: vi.fn().mockResolvedValue({ count: 37 }),
      searchPage: vi.fn(),
      searchIncremental: vi.fn(),
      fetchDocument: vi.fn(),
    };

    const result = await previewDiscoveryRun({
      actorId: 'operator-1',
      request,
      repository: store,
      pubmed,
      secret: 'test-preview-secret',
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      snapshot: { mode: 'SCOPED', geneIds: ['gene_egfr'] },
      documentLimit: 50,
      estimatedMatchCount: 37,
      window: {
        from: '2026-06-18T12:00:00.000Z',
        to: '2026-09-16T12:00:00.000Z',
      },
      expiresAt: '2026-09-16T12:15:00.000Z',
    });
    expect(result.previewToken.split('.')).toHaveLength(2);
    expect(store.createManualDiscoveryRun).not.toHaveBeenCalled();
  });

  it('creates from an untampered token and binds the confirmation to its actor', async () => {
    const store = repository();
    const preview = await previewDiscoveryRun({
      actorId: 'operator-1',
      request,
      repository: store,
      pubmed: {
        previewSearch: vi.fn().mockResolvedValue({ count: 2 }),
        searchPage: vi.fn(),
        searchIncremental: vi.fn(),
        fetchDocument: vi.fn(),
      },
      secret: 'test-preview-secret',
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    });

    await expect(
      createDiscoveryRunFromPreview({
        actorId: 'operator-1',
        previewToken: preview.previewToken,
        idempotencyKey: 'manual-run-1',
        repository: store,
        secret: 'test-preview-secret',
        workflowVersion: 'pubmed-discovery-v2',
        now: () => new Date('2026-09-16T12:01:00.000Z'),
      })
    ).resolves.toMatchObject({ run: { id: 'run-1' } });
    expect(store.createManualDiscoveryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'operator-1',
        idempotencyKey: 'manual-run-1',
        preview: expect.objectContaining({ previewHash: expect.any(String) }),
      })
    );

    await expect(
      createDiscoveryRunFromPreview({
        actorId: 'operator-2',
        previewToken: preview.previewToken,
        idempotencyKey: 'manual-run-2',
        repository: store,
        secret: 'test-preview-secret',
        workflowVersion: 'pubmed-discovery-v2',
        now: () => new Date('2026-09-16T12:01:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'PREVIEW_TOKEN_INVALID', status: 409 });
  });

  it('rejects empty scoped input, invalid windows, expired and tampered previews', async () => {
    const store = repository();
    const pubmed = {
      previewSearch: vi.fn().mockResolvedValue({ count: 0 }),
      searchPage: vi.fn(),
      searchIncremental: vi.fn(),
      fetchDocument: vi.fn(),
    };
    await expect(
      previewDiscoveryRun({
        actorId: 'operator-1',
        request: {
          scope: {
            mode: 'SCOPED',
            diseaseIds: [],
            geneIds: [],
            variantIds: [],
          },
          documentLimit: 50,
        },
        repository: store,
        pubmed,
        secret: 'test-preview-secret',
      })
    ).rejects.toMatchObject({ code: 'DISCOVERY_SCOPE_REQUIRED', status: 400 });

    await expect(
      previewDiscoveryRun({
        actorId: 'operator-1',
        request: {
          ...request,
          window: {
            from: '2026-09-17T00:00:00.000Z',
            to: '2026-09-16T00:00:00.000Z',
          },
        },
        repository: store,
        pubmed,
        secret: 'test-preview-secret',
      })
    ).rejects.toMatchObject({ code: 'INVALID_DISCOVERY_WINDOW', status: 400 });

    const preview = await previewDiscoveryRun({
      actorId: 'operator-1',
      request,
      repository: store,
      pubmed,
      secret: 'test-preview-secret',
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    });
    await expect(
      createDiscoveryRunFromPreview({
        actorId: 'operator-1',
        previewToken: `${preview.previewToken}tampered`,
        idempotencyKey: 'manual-run-1',
        repository: store,
        secret: 'test-preview-secret',
        workflowVersion: 'pubmed-discovery-v2',
      })
    ).rejects.toMatchObject({ code: 'PREVIEW_TOKEN_INVALID', status: 409 });
    await expect(
      createDiscoveryRunFromPreview({
        actorId: 'operator-1',
        previewToken: preview.previewToken,
        idempotencyKey: 'manual-run-1',
        repository: store,
        secret: 'test-preview-secret',
        workflowVersion: 'pubmed-discovery-v2',
        now: () => new Date('2026-09-16T12:16:00.000Z'),
      })
    ).rejects.toMatchObject({ code: 'PREVIEW_TOKEN_EXPIRED', status: 409 });
  });

  it('uses successful cutoffs, normalizes ids and reports capped or all-result work', async () => {
    const store = repository();
    vi.mocked(store.resolveDiscoveryScope).mockResolvedValue({
      snapshot: {
        mode: 'SCOPED',
        diseaseIds: ['disease_nsclc'],
        geneIds: ['gene_egfr'],
        variantIds: ['variant_l858r'],
        aliasVersion: 'catalog-v1',
        knowledgeReleaseId: 'release-1',
        knowledgeReleaseVersion: 'v0.2.0',
      },
      queries: [
        {
          strategyId: 'strategy-1',
          strategyVersion: '1.0.0',
          associationId: 'association-1',
          query: 'EGFR AND NSCLC',
          label: 'NSCLC · EGFR',
        },
      ],
      lastSuccessfulCutoffAt: '2026-09-10T00:00:00.000Z',
      overlapDays: 2,
    });
    const pubmed = {
      previewSearch: vi.fn().mockResolvedValue({ count: 75 }),
      searchPage: vi.fn(),
      searchIncremental: vi.fn(),
      fetchDocument: vi.fn(),
    };
    const capped = await previewDiscoveryRun({
      actorId: 'operator-1',
      request: {
        scope: {
          mode: 'SCOPED',
          diseaseIds: [' disease_nsclc ', 'disease_nsclc'],
          geneIds: ['gene_egfr'],
          variantIds: ['variant_l858r'],
        },
        documentLimit: 50,
      },
      repository: store,
      pubmed,
      secret: 'test-preview-secret',
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    });
    expect(store.resolveDiscoveryScope).toHaveBeenCalledWith({
      mode: 'SCOPED',
      diseaseIds: ['disease_nsclc'],
      geneIds: ['gene_egfr'],
      variantIds: ['variant_l858r'],
    });
    expect(capped.window.from).toBe('2026-09-08T00:00:00.000Z');
    expect(capped.warnings).toContain('去重后最多处理 50 篇唯一文献。');

    vi.mocked(store.resolveDiscoveryScope).mockResolvedValue({
      ...(await vi.mocked(store.resolveDiscoveryScope).mock.results[0].value),
      snapshot: {
        ...capped.snapshot,
        mode: 'ALL_KNOWLEDGE',
      },
      lastSuccessfulCutoffAt: null,
    });
    const all = await previewDiscoveryRun({
      actorId: 'operator-1',
      request: { scope: { mode: 'ALL_KNOWLEDGE' }, documentLimit: 'ALL' },
      repository: store,
      pubmed,
      secret: 'test-preview-secret',
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    });
    expect(all.warnings[1]).toContain('耗时与模型费用可能较高');
  });

  it('rejects invalid limits, dates, empty resolved scopes and unsafe confirmations', async () => {
    const store = repository();
    const pubmed = {
      previewSearch: vi.fn().mockResolvedValue({ count: 0 }),
      searchPage: vi.fn(),
      searchIncremental: vi.fn(),
      fetchDocument: vi.fn(),
    };
    await expect(
      previewDiscoveryRun({
        actorId: 'operator-1',
        request: { ...request, documentLimit: 25 as never },
        repository: store,
        pubmed,
        secret: 'test-preview-secret',
      })
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT_LIMIT' });

    vi.mocked(store.resolveDiscoveryScope).mockResolvedValueOnce({
      snapshot: {
        mode: 'ALL_KNOWLEDGE',
        diseaseIds: [],
        geneIds: [],
        variantIds: [],
        aliasVersion: 'catalog-v1',
        knowledgeReleaseId: 'release-1',
        knowledgeReleaseVersion: 'v0.2.0',
      },
      queries: [],
      lastSuccessfulCutoffAt: null,
      overlapDays: 0,
    });
    await expect(
      previewDiscoveryRun({
        actorId: 'operator-1',
        request: { scope: { mode: 'ALL_KNOWLEDGE' }, documentLimit: 'ALL' },
        repository: store,
        pubmed,
        secret: 'test-preview-secret',
      })
    ).rejects.toMatchObject({ code: 'DISCOVERY_SCOPE_CONFLICT' });

    await expect(
      previewDiscoveryRun({
        actorId: 'operator-1',
        request: { ...request, window: { from: 'not-a-date' } },
        repository: store,
        pubmed,
        secret: 'test-preview-secret',
      })
    ).rejects.toMatchObject({ code: 'INVALID_DISCOVERY_WINDOW' });
    await expect(
      previewDiscoveryRun({
        actorId: 'operator-1',
        request,
        repository: store,
        pubmed,
        secret: ' ',
      })
    ).rejects.toThrow('Preview signing secret is required');
    await expect(
      createDiscoveryRunFromPreview({
        actorId: 'operator-1',
        previewToken: 'invalid',
        idempotencyKey: ' ',
        repository: store,
        secret: 'test-preview-secret',
        workflowVersion: 'pubmed-discovery-v2',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });

    const payload = Buffer.from('{').toString('base64url');
    const signature = createHmac('sha256', 'test-preview-secret')
      .update(payload)
      .digest('base64url');
    await expect(
      createDiscoveryRunFromPreview({
        actorId: 'operator-1',
        previewToken: `${payload}.${signature}`,
        idempotencyKey: 'manual-run-invalid-json',
        repository: store,
        secret: 'test-preview-secret',
        workflowVersion: 'pubmed-discovery-v2',
      })
    ).rejects.toMatchObject({ code: 'PREVIEW_TOKEN_INVALID' });
  });

  it('routes a CIViC pilot preview to CIViC and keeps source provenance in the signed snapshot', async () => {
    const store = repository();
    const pubmed = {
      previewSearch: vi.fn(),
      searchPage: vi.fn(),
      searchIncremental: vi.fn(),
      fetchDocument: vi.fn(),
    };
    const civic = {
      previewSearch: vi.fn().mockResolvedValue({ count: 32 }),
      searchPage: vi.fn(),
    };

    const result = await previewDiscoveryRun({
      actorId: 'operator-1',
      request: { ...request, source: 'CIVIC' },
      repository: store,
      pubmed,
      civic,
      secret: 'test-preview-secret',
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    });

    expect(store.resolveDiscoveryScope).toHaveBeenCalledWith(
      request.scope,
      'CIVIC'
    );
    expect(civic.previewSearch).toHaveBeenCalledTimes(1);
    expect(pubmed.previewSearch).not.toHaveBeenCalled();
    expect(result.snapshot.source).toBe('CIVIC');
    expect(result.warnings).toContain(
      'CIViC 数量按证据条目估算；同一 PubMed 文献可能对应多个条目，入库前会按 PMID 去重。'
    );
  });
});
