import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { createMemoryMinIntervalStore } from '@/shared/lib/rate-limit';
import { createPubmedSourceAdapter } from '@/shared/services/evidence-platform/pubmed-source-adapter';

function response(body: unknown, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PubMed source adapter', () => {
  it('previews counts and pages through an opaque NCBI History cursor', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ esearchresult: { count: '123', idlist: [] } })
      )
      .mockResolvedValueOnce(
        response({
          esearchresult: {
            count: '123',
            idlist: ['300', '200', '100'],
            webenv: 'history-token',
            querykey: '7',
          },
        })
      )
      .mockResolvedValueOnce(response('99\n98\n97\n'));
    const adapter = createPubmedSourceAdapter({ fetch });

    await expect(
      adapter.previewSearch({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).resolves.toEqual({ count: 123 });
    const firstPage = await adapter.searchPage({
      query: 'EGFR',
      from: '2026-09-01',
      to: '2026-09-15',
      cursor: null,
      pageSize: 3,
    });
    expect(firstPage).toMatchObject({
      ids: ['300', '200', '100'],
      total: 123,
      nextCursor: expect.any(String),
    });
    const pageUrl = new URL(fetch.mock.calls[1][0]);
    expect(pageUrl.searchParams.get('usehistory')).toBe('y');
    expect(pageUrl.searchParams.get('retstart')).toBe('0');
    expect(pageUrl.searchParams.get('retmax')).toBe('3');

    await adapter.searchPage({
      query: 'EGFR',
      from: '2026-09-01',
      to: '2026-09-15',
      cursor: firstPage.nextCursor,
      pageSize: 3,
    });
    const historyUrl = new URL(fetch.mock.calls.at(-1)![0]);
    expect(historyUrl.pathname).toMatch(/\/efetch\.fcgi$/);
    expect(historyUrl.searchParams.get('WebEnv')).toBe('history-token');
    expect(historyUrl.searchParams.get('query_key')).toBe('7');
    expect(historyUrl.searchParams.get('retstart')).toBe('3');
  });

  it('rejects invalid preview, page controls, payloads, and history cursors', async () => {
    const neverFetch = vi.fn();
    const local = createPubmedSourceAdapter({ fetch: neverFetch });
    await expect(
      local.previewSearch({
        query: ' ',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      local.searchPage({
        query: ' ',
        from: '2026-09-01',
        to: '2026-09-15',
        pageSize: 20,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      local.searchPage({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
        pageSize: 201,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      local.searchPage({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
        pageSize: 20,
        cursor: 'not-a-history-cursor',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(neverFetch).not.toHaveBeenCalled();

    const invalidPreview = createPubmedSourceAdapter({
      fetch: vi
        .fn()
        .mockResolvedValue(response({ esearchresult: { count: '-1' } })),
    });
    await expect(
      invalidPreview.previewSearch({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const invalidPage = createPubmedSourceAdapter({
      fetch: vi.fn().mockResolvedValue(
        response({
          esearchresult: {
            count: '1',
            idlist: ['12345678'],
            webenv: '',
            querykey: 'not-numeric',
          },
        })
      ),
    });
    await expect(
      invalidPage.searchPage({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
        pageSize: 20,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('searches one explicit incremental window with stable PMID order', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response({ esearchresult: { idlist: ['300', '100', '200', '100'] } })
      );
    const adapter = createPubmedSourceAdapter({
      fetch,
      apiKey: 'ncbi-key',
      tool: 'evidex',
      email: 'ops@example.com',
    });

    await expect(
      adapter.searchIncremental({
        query: '(EGFR[Title/Abstract]) AND cancer',
        from: '2026-09-01',
        to: '2026-09-15',
        limit: 50,
      })
    ).resolves.toEqual(['100', '200', '300']);

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toMatch(/\/esearch\.fcgi$/);
    expect(url.searchParams.get('datetype')).toBe('edat');
    expect(url.searchParams.get('mindate')).toBe('2026/09/01');
    expect(url.searchParams.get('maxdate')).toBe('2026/09/15');
    expect(url.searchParams.get('api_key')).toBe('ncbi-key');
  });

  it('fetches normalized metadata plus abstract and computes a document hash', async () => {
    const abstract = 'A structured abstract suitable for evidence screening.';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          result: {
            uids: ['12345678'],
            '12345678': {
              uid: '12345678',
              title: ' Evidence title. ',
              fulljournalname: 'Evidence Journal',
              pubdate: '2026 Sep 2',
              articleids: [
                { idtype: 'doi', value: '10.1000/ABC.1' },
                { idtype: 'pmc', value: 'PMC123' },
              ],
            },
          },
        })
      )
      .mockResolvedValueOnce(response(abstract));
    const adapter = createPubmedSourceAdapter({ fetch });

    await expect(adapter.fetchDocument('12345678')).resolves.toEqual({
      pmid: '12345678',
      title: 'Evidence title.',
      abstract,
      doi: '10.1000/abc.1',
      documentHash: createHash('sha256').update(abstract).digest('hex'),
      publicationDate: '2026-09-02',
      journal: 'Evidence Journal',
      pmcid: 'PMC123',
      sourceScope: 'ABSTRACT',
      license: null,
      licensePolicy: {
        decision: 'UNKNOWN',
        licenseType: null,
        licenseText: null,
        reason: 'PMC_LICENSE_LOOKUP_FAILED',
      },
      fullText: null,
      url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
    });
  });

  it('classifies rate limiting as retryable and malformed data as non-retryable', async () => {
    const rateLimited = createPubmedSourceAdapter({
      fetch: vi.fn().mockResolvedValue(response('slow down', 429)),
    });
    await expect(
      rateLimited.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryable: true });

    const malformed = createPubmedSourceAdapter({
      fetch: vi.fn().mockResolvedValue(response({ result: {} })),
    });
    await expect(malformed.fetchDocument('12345678')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });
  });

  it('honors Retry-After and retries transient responses with a bounded policy', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow down', {
          status: 429,
          headers: { 'retry-after': '2' },
        })
      )
      .mockResolvedValueOnce(
        response({ esearchresult: { idlist: ['12345678'] } })
      );
    const adapter = createPubmedSourceAdapter({
      fetch,
      sleep,
      random: () => 0,
    });

    await expect(
      adapter.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).resolves.toEqual(['12345678']);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('honors an HTTP-date Retry-After value', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('unavailable', {
          status: 503,
          headers: { 'retry-after': 'Thu, 01 Jan 2026 00:00:02 GMT' },
        })
      )
      .mockResolvedValueOnce(
        response({ esearchresult: { idlist: ['12345678'] } })
      );
    const adapter = createPubmedSourceAdapter({
      fetch,
      sleep,
      now: () => Date.parse('2026-01-01T00:00:00Z'),
      maxAttempts: 2,
    });

    await expect(
      adapter.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).resolves.toEqual(['12345678']);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('enforces a shared PubMed request slot when throttling is enabled', async () => {
    let current = 1_000;
    const sleep = vi.fn(async (milliseconds: number) => {
      current += milliseconds;
    });
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        response({ esearchresult: { count: '1' } })
      );
    const rateLimitStore = createMemoryMinIntervalStore();
    const firstAdapter = createPubmedSourceAdapter({
      fetch,
      sleep,
      now: () => current,
      baseUrl: 'https://pubmed-throttle.test/',
      enforceThrottle: true,
      rateLimitStore,
    });
    const secondAdapter = createPubmedSourceAdapter({
      fetch,
      sleep,
      now: () => current,
      baseUrl: 'https://pubmed-throttle.test/',
      enforceThrottle: true,
      rateLimitStore,
    });
    const input = {
      query: 'EGFR',
      from: '2026-09-01',
      to: '2026-09-15',
    };

    await firstAdapter.previewSearch(input);
    await secondAdapter.previewSearch(input);

    expect(sleep).toHaveBeenCalledWith(340);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses permitted PMC full text and keeps license metadata when available', async () => {
    const abstract = 'Abstract fallback.';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          result: {
            '12345678': {
              uid: '12345678',
              title: 'Open evidence study',
              articleids: [{ idtype: 'pmc', value: 'PMC123' }],
            },
          },
        })
      )
      .mockResolvedValueOnce(response(abstract))
      .mockResolvedValueOnce(
        new Response(
          '<OAI-PMH><record><metadata><article><permissions><license license-type="open-access"><license-p>CC BY 4.0</license-p></license></permissions><body><sec><p>Full text result one.</p><p>Full text result two.</p></sec></body></article></metadata></record></OAI-PMH>',
          { status: 200, headers: { 'content-type': 'application/xml' } }
        )
      );
    const adapter = createPubmedSourceAdapter({ fetch });

    await expect(adapter.fetchDocument('12345678')).resolves.toMatchObject({
      pmcid: 'PMC123',
      sourceScope: 'PMC_FULL_TEXT',
      license: 'CC BY 4.0',
      licensePolicy: {
        decision: 'ALLOWED',
        licenseType: 'open-access',
        licenseText: 'CC BY 4.0',
        reason: 'PMC_LICENSE_ALLOWED_BY_WHITELIST',
      },
      fullText: 'Full text result one.\n\nFull text result two.',
    });
    const fullTextUrl = new URL(fetch.mock.calls[2][0]);
    expect(fullTextUrl.hostname).toBe('pmc.ncbi.nlm.nih.gov');
    expect(fullTextUrl.searchParams.get('metadataPrefix')).toBe('pmc');
  });

  it('falls back to the abstract and records a rejected PMC license decision', async () => {
    const abstract = 'Abstract fallback.';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          result: {
            '12345678': {
              uid: '12345678',
              title: 'Restricted evidence study',
              articleids: [{ idtype: 'pmc', value: 'PMC123' }],
            },
          },
        })
      )
      .mockResolvedValueOnce(response(abstract))
      .mockResolvedValueOnce(
        new Response(
          '<OAI-PMH><record><metadata><article><permissions><license license-type="open-access"><license-p>CC BY-NC-ND 4.0</license-p></license></permissions><body><p>Restricted full text.</p></body></article></metadata></record></OAI-PMH>',
          { status: 200, headers: { 'content-type': 'application/xml' } }
        )
      );

    await expect(
      createPubmedSourceAdapter({ fetch }).fetchDocument('12345678')
    ).resolves.toMatchObject({
      sourceScope: 'ABSTRACT',
      license: 'CC BY-NC-ND 4.0',
      licensePolicy: {
        decision: 'REJECTED',
        licenseType: 'open-access',
        licenseText: 'CC BY-NC-ND 4.0',
        reason: 'PMC_LICENSE_NOT_IN_WHITELIST',
      },
      fullText: null,
      documentHash: createHash('sha256').update(abstract).digest('hex'),
    });
  });

  it('rejects invalid search controls and malformed search payloads locally', async () => {
    const fetch = vi.fn();
    const adapter = createPubmedSourceAdapter({ fetch });
    await expect(
      adapter.searchIncremental({
        query: 'EGFR',
        from: 'bad',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
    await expect(
      adapter.searchIncremental({
        query: ' ',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
    await expect(
      adapter.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
        limit: 0,
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
    expect(fetch).not.toHaveBeenCalled();

    const malformed = createPubmedSourceAdapter({
      fetch: vi
        .fn()
        .mockResolvedValue(response({ esearchresult: { idlist: [null] } })),
    });
    await expect(
      malformed.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('classifies network, server, client, and invalid JSON failures', async () => {
    const network = createPubmedSourceAdapter({
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    await expect(
      network.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: true });

    for (const [status, code, retryable] of [
      [503, 'UNAVAILABLE', true],
      [400, 'INVALID_RESPONSE', false],
    ] as const) {
      const adapter = createPubmedSourceAdapter({
        fetch: vi.fn().mockResolvedValue(response('error', status)),
      });
      await expect(
        adapter.searchIncremental({
          query: 'EGFR',
          from: '2026-09-01',
          to: '2026-09-15',
        })
      ).rejects.toMatchObject({ code, retryable });
    }

    const invalidJson = createPubmedSourceAdapter({
      fetch: vi.fn().mockResolvedValue(
        new Response('{', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      ),
    });
    await expect(
      invalidJson.searchIncremental({
        query: 'EGFR',
        from: '2026-09-01',
        to: '2026-09-15',
      })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: false });
  });

  it('rejects invalid PMIDs and empty abstracts and normalizes absent metadata', async () => {
    const neverFetch = vi.fn();
    await expect(
      createPubmedSourceAdapter({ fetch: neverFetch }).fetchDocument('bad')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(neverFetch).not.toHaveBeenCalled();

    const summary = {
      result: {
        '12345678': {
          uid: '12345678',
          title: 'Title',
          fulljournalname: ' ',
          pubdate: '2026 Foo 2',
          articleids: null,
        },
      },
    };
    const emptyAbstract = createPubmedSourceAdapter({
      fetch: vi
        .fn()
        .mockResolvedValueOnce(response(summary))
        .mockResolvedValueOnce(response('   ')),
    });
    await expect(emptyAbstract.fetchDocument('12345678')).rejects.toMatchObject(
      {
        code: 'INVALID_RESPONSE',
      }
    );

    const metadataFallback = createPubmedSourceAdapter({
      fetch: vi
        .fn()
        .mockResolvedValueOnce(response(summary))
        .mockResolvedValueOnce(response('Abstract.')),
      baseUrl: 'https://pubmed.test/',
    });
    await expect(
      metadataFallback.fetchDocument('12345678')
    ).resolves.toMatchObject({
      doi: null,
      publicationDate: null,
      journal: null,
    });
  });
});
