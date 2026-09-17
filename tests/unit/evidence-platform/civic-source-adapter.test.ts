import { describe, expect, it, vi } from 'vitest';

import {
  buildCivicPilotQuery,
  CivicSourceError,
  createCivicSourceAdapter,
} from '@/shared/services/evidence-platform/civic-source-adapter';

function response(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function evidenceItem(
  id: number,
  pmid: string,
  profile = 'EGFR L858R',
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    name: `EID${id}`,
    status: 'ACCEPTED',
    evidenceType: 'PREDICTIVE',
    molecularProfile: { name: profile },
    disease: { name: 'Lung Non-small Cell Carcinoma', doid: '3908' },
    source: {
      citationId: pmid,
      sourceType: 'PUBMED',
      citation: 'Example et al., 2025',
      publicationYear: 2025,
    },
    therapies: [{ name: 'Osimertinib' }],
    evidenceLevel: 'B',
    evidenceDirection: 'SUPPORTS',
    significance: 'SENSITIVITYRESPONSE',
    ...overrides,
  };
}

describe('CIViC pilot source adapter', () => {
  it('builds queries only for the approved two-disease, five-variant pilot matrix', () => {
    expect(
      buildCivicPilotQuery({
        diseaseId: 'disease_nsclc',
        variantId: 'variant_egfr_l858r',
      })
    ).toContain('"profileName":"L858R"');
    expect(
      buildCivicPilotQuery({
        diseaseId: 'disease_nsclc',
        variantId: 'variant_kras_g12c',
      })
    ).toContain('"geneSymbol":"KRAS"');
    expect(
      buildCivicPilotQuery({
        diseaseId: 'disease_crc',
        variantId: 'variant_kras_g12d',
      })
    ).toContain('"diseaseName":"Colorectal Cancer"');
    expect(
      buildCivicPilotQuery({
        diseaseId: 'disease_crc',
        variantId: 'variant_egfr_l858r',
      })
    ).toBeNull();
  });

  it('previews the accepted predictive evidence-item count from GraphQL', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        data: {
          evidenceItems: {
            totalCount: 32,
            pageInfo: { hasNextPage: true, endCursor: 'MQ' },
            nodes: [],
          },
        },
      })
    );
    const adapter = createCivicSourceAdapter({ fetch, maxAttempts: 1 });
    const query = buildCivicPilotQuery({
      diseaseId: 'disease_nsclc',
      variantId: 'variant_egfr_l858r',
    })!;

    await expect(
      adapter.previewSearch({ query, from: '2026-01-01', to: '2026-09-16' })
    ).resolves.toEqual({ count: 32 });
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body.variables).toMatchObject({
      first: 1,
      after: null,
      molecularProfileName: 'L858R',
      diseaseName: 'Lung Non-small Cell Carcinoma',
    });
    expect(body.query).toContain('status: ACCEPTED');
    expect(body.query).toContain('evidenceType: PREDICTIVE');
  });

  it('keeps only accepted predictive PubMed hits for the exact gene and groups EIDs by PMID', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        data: {
          evidenceItems: {
            totalCount: 8,
            pageInfo: { hasNextPage: true, endCursor: 'Nw' },
            nodes: [
              evidenceItem(10, '11111111'),
              evidenceItem(11, '11111111', 'EGFR L858R AND TP53 R273H'),
              evidenceItem(12, '22222222', 'EGFR L858R OR EGFR EXON 19 DEL'),
              evidenceItem(13, '33333333', 'ERBB2 L858R'),
              evidenceItem(14, '44444444', 'EGFR L858R', {
                source: { citationId: '44444444', sourceType: 'ASCO' },
              }),
              evidenceItem(15, '55555555', 'EGFR L858R', {
                status: 'SUBMITTED',
              }),
              evidenceItem(16, '66666666', 'EGFR L858R', {
                evidenceType: 'PROGNOSTIC',
              }),
              evidenceItem(17, '88888888', 'EGFR L858R', {
                disease: { name: 'Colorectal Cancer', doid: '9256' },
              }),
            ],
          },
        },
      })
    );
    const adapter = createCivicSourceAdapter({
      fetch,
      maxAttempts: 1,
      now: () => 1_789_488_000_000,
    });
    const query = buildCivicPilotQuery({
      diseaseId: 'disease_nsclc',
      variantId: 'variant_egfr_l858r',
    })!;

    const page = await adapter.searchPage({
      query,
      from: '2026-01-01',
      to: '2026-09-16',
      pageSize: 20,
      cursor: null,
    });

    expect(page.ids).toEqual(['11111111', '22222222']);
    expect(page.total).toBe(8);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.provenanceById).toMatchObject({
      '11111111': {
        source: 'CIVIC',
        retrievedAt: '2026-09-15T16:00:00.000Z',
        evidenceItems: [
          { eid: 10, applicability: 'EXACT' },
          { eid: 11, applicability: 'COMPOUND_REQUIRES_REVIEW' },
        ],
      },
      '22222222': {
        evidenceItems: [{ eid: 12, applicability: 'GROUP_INCLUDES_EXACT' }],
      },
    });

    fetch.mockResolvedValueOnce(
      response({
        data: {
          evidenceItems: {
            totalCount: 8,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [evidenceItem(18, '77777777')],
          },
        },
      })
    );
    const next = await adapter.searchPage({
      query,
      from: '2026-01-01',
      to: '2026-09-16',
      pageSize: 20,
      cursor: page.nextCursor,
    });
    expect(next.nextCursor).toBeNull();
    expect(
      JSON.parse(fetch.mock.calls[1][1].body as string).variables.after
    ).toBe('Nw');
  });

  it('retries rate limits, rejects tampered cursors and fails closed on malformed payloads', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow down', {
          status: 429,
          headers: { 'retry-after': '0' },
        })
      )
      .mockResolvedValueOnce(
        response({
          data: {
            evidenceItems: {
              totalCount: 0,
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        })
      );
    const adapter = createCivicSourceAdapter({
      fetch,
      sleep,
      random: () => 0,
      maxAttempts: 2,
    });
    const query = buildCivicPilotQuery({
      diseaseId: 'disease_crc',
      variantId: 'variant_kras_g12d',
    })!;

    await expect(
      adapter.previewSearch({ query, from: '2026-01-01', to: '2026-09-16' })
    ).resolves.toEqual({ count: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);

    await expect(
      adapter.searchPage({
        query,
        from: '2026-01-01',
        to: '2026-09-16',
        pageSize: 20,
        cursor: 'not-a-cursor',
      })
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });

    const malformed = createCivicSourceAdapter({
      fetch: vi.fn().mockResolvedValue(response({ data: {} })),
      maxAttempts: 1,
    });
    await expect(
      malformed.previewSearch({
        query,
        from: '2026-01-01',
        to: '2026-09-16',
      })
    ).rejects.toBeInstanceOf(CivicSourceError);
  });

  it('rejects unsupported or malformed pilot queries before making a request', async () => {
    const fetch = vi.fn();
    const adapter = createCivicSourceAdapter({ fetch });

    await expect(
      adapter.previewSearch({
        query: '{"version":1,"diseaseId":"other"}',
        from: '2026-01-01',
        to: '2026-09-16',
      })
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_SCOPE',
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('classifies network, server, client, JSON and GraphQL failures without accepting partial data', async () => {
    const query = buildCivicPilotQuery({
      diseaseId: 'disease_nsclc',
      variantId: 'variant_egfr_l858r',
    })!;
    const input = { query, from: '2026-01-01', to: '2026-09-16' };

    await expect(
      createCivicSourceAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('offline')),
        maxAttempts: 1,
      }).previewSearch(input)
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    await expect(
      createCivicSourceAdapter({
        fetch: vi.fn().mockResolvedValue(new Response('', { status: 503 })),
        maxAttempts: 1,
      }).previewSearch(input)
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });
    await expect(
      createCivicSourceAdapter({
        fetch: vi.fn().mockResolvedValue(new Response('', { status: 400 })),
        maxAttempts: 1,
      }).previewSearch(input)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
    await expect(
      createCivicSourceAdapter({
        fetch: vi.fn().mockResolvedValue(
          new Response('{', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        ),
        maxAttempts: 1,
      }).previewSearch(input)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      createCivicSourceAdapter({
        fetch: vi.fn().mockResolvedValue(response({ errors: [{}] })),
        maxAttempts: 1,
      }).previewSearch(input)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      createCivicSourceAdapter({ fetch: vi.fn(), maxAttempts: 1 }).searchPage({
        ...input,
        pageSize: 101,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('uses the shared throttle, authorization header and conservative nullable provenance', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const rateLimitStore = {
      claim: vi
        .fn()
        .mockResolvedValueOnce({ allowed: false, retryAfterMs: 12 })
        .mockResolvedValueOnce({ allowed: true, retryAfterMs: 0 }),
    };
    const fetch = vi.fn().mockResolvedValue(
      response({
        data: {
          evidenceItems: {
            totalCount: 1,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              evidenceItem(20, '99999999', 'EGFR L858R amplification', {
                disease: {
                  name: '  Lung Non-small Cell Carcinoma  ',
                  doid: null,
                },
                source: {
                  citationId: '99999999',
                  sourceType: 'PUBMED',
                  publicationYear: '2025',
                },
              }),
            ],
          },
        },
      })
    );
    const adapter = createCivicSourceAdapter({
      fetch,
      apiKey: 'test-token',
      baseUrl: 'https://example.test/graphql',
      enforceThrottle: true,
      rateLimitStore,
      sleep,
      maxAttempts: 1,
    });
    const query = buildCivicPilotQuery({
      diseaseId: 'disease_nsclc',
      variantId: 'variant_egfr_l858r',
    })!;

    const page = await adapter.searchPage({
      query,
      from: '2026-01-01',
      to: '2026-09-16',
      pageSize: 1,
    });

    expect(rateLimitStore.claim).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(12);
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/graphql',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer test-token',
        }),
      })
    );
    expect(page.provenanceById['99999999'].evidenceItems[0]).toMatchObject({
      diseaseDoid: null,
      citation: null,
      publicationYear: null,
      applicability: 'OTHER_REQUIRES_REVIEW',
    });
  });
});
