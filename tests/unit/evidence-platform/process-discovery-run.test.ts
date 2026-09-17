import { describe, expect, it, vi } from 'vitest';

import type { DiscoveryRunRepository } from '@/shared/services/evidence-platform/discovery-run';
import { processPersistentDiscoveryRun } from '@/shared/services/evidence-platform/process-discovery-run';

const counts = {
  discovered: 0,
  duplicate: 0,
  excluded: 0,
  processing: 0,
  readyForReview: 0,
  published: 0,
  failed: 0,
};

function repository(): DiscoveryRunRepository {
  let unique = 0;
  let processed = 0;
  const current = { ...counts };
  return {
    resolveDiscoveryScope: vi.fn(),
    createManualDiscoveryRun: vi.fn(),
    transitionDiscoveryRun: vi.fn(),
    claimPlatformJob: vi.fn(),
    completePlatformJob: vi.fn(),
    failPlatformJob: vi.fn(),
    beginDiscoveryRun: vi.fn().mockResolvedValue({
      run: {
        id: 'run-1',
        status: 'RUNNING',
        windowFrom: '2026-09-01T00:00:00.000Z',
        windowTo: '2026-09-16T00:00:00.000Z',
        documentLimit: 50,
        uniqueDiscoveredCount: 0,
        processedDocumentCount: 0,
        counts: current,
      },
      queries: [
        {
          id: 'query-1',
          strategyId: 'strategy-1',
          strategyVersion: '1.0.0',
          associationId: 'association-1',
          query: 'EGFR AND NSCLC',
          label: 'NSCLC · EGFR',
          sourceCursor: null,
          exhausted: false,
        },
      ],
    }),
    getDiscoveryRunStatus: vi.fn().mockResolvedValue('RUNNING'),
    claimDiscoveryDocument: vi.fn(async () => ({
      shouldProcess: true,
      limitReached: false,
      uniqueDiscoveredCount: ++unique,
    })),
    recordDiscoveryDocumentOutcome: vi.fn(async ({ outcome }) => {
      processed += 1;
      current.discovered = unique;
      if (outcome === 'DUPLICATE') current.duplicate += 1;
      if (outcome === 'EXCLUDED') current.excluded += 1;
      if (outcome === 'READY_FOR_REVIEW') current.readyForReview += 1;
      if (outcome === 'FAILED') current.failed += 1;
      return { counts: { ...current }, processedDocumentCount: processed };
    }),
    recordDiscoveryProvenance: vi.fn(),
    attachCandidateToDiscoveryStrategy: vi.fn(),
    saveDiscoveryQueryProgress: vi.fn(),
    finishDiscoveryRun: vi.fn(),
  };
}

describe('persistent Discovery Run processor', () => {
  it('returns without side effects when a run is no longer runnable', async () => {
    const store = repository();
    store.beginDiscoveryRun = vi.fn().mockResolvedValue(null);
    await expect(
      processPersistentDiscoveryRun({
        runId: 'run-1',
        repository: store,
        upstreamRepository: {} as never,
        pubmed: {} as never,
        extractionGenerator: {} as never,
        workflowVersion: 'single-pubmed-v2',
        agentVersion: 'extraction-agent@2.0.0',
      })
    ).resolves.toEqual({ status: 'NOT_RUNNABLE' });
    expect(store.finishDiscoveryRun).not.toHaveBeenCalled();
  });

  it('pages PubMed, deduplicates before extraction and finishes with reviewable output', async () => {
    const store = repository();
    const upstream = {
      getAssociationReviewContext: vi.fn().mockResolvedValue({
        id: 'association-1',
        approvedLevel: '1',
        gradingRationale: 'Pending independent review.',
        eligibilityTerms: {
          diseases: ['NSCLC'],
          genes: ['EGFR'],
          variants: [],
        },
      }),
      findDuplicate: vi
        .fn()
        .mockResolvedValueOnce({ candidateId: 'candidate-existing' })
        .mockResolvedValueOnce(null),
      createCandidateBundle: vi.fn().mockResolvedValue({
        candidateId: 'candidate-new',
        workflowRunId: 'workflow-new',
        draftId: 'draft-new',
        draftVersion: 1,
        reviewTaskId: 'review-new',
        status: 'READY_FOR_REVIEW',
        duplicate: false,
      }),
    };
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn().mockResolvedValue({
        ids: ['11111111', '22222222'],
        total: 2,
        nextCursor: null,
      }),
      fetchDocument: vi.fn(async (pmid: string) => ({
        pmid,
        title: `EGFR study ${pmid}`,
        abstract: 'A study of EGFR in NSCLC. A response was observed.',
        doi: `10.1000/${pmid}`,
        documentHash: `hash-${pmid}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      })),
    };
    const result = await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: upstream,
      pubmed,
      extractionGenerator: {
        generate: vi.fn().mockResolvedValue({
          claims: [
            {
              claimType: 'EFFICACY',
              evidenceMaturity: 'LIMITED_CLINICAL',
              studyType: 'trial',
              studyName: null,
              populationSummary: 'NSCLC',
              sampleSize: 10,
              diseaseStage: null,
              treatmentLine: null,
              priorTherapy: null,
              intervention: 'osimertinib',
              comparator: null,
              endpoint: 'response',
              effectValue: null,
              conclusion: 'Response was observed.',
              limitations: 'Small sample.',
            },
          ],
          qaIssues: [],
        }),
      },
      workflowVersion: 'single-pubmed-v2',
      agentVersion: 'extraction-agent@2.0.0',
    });

    expect(pubmed.searchPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, pageSize: 20 })
    );
    expect(upstream.createCandidateBundle).toHaveBeenCalledTimes(1);
    expect(upstream.createCandidateBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        skillTraces: expect.arrayContaining([
          expect.objectContaining({
            agentId: 'eligibility-agent',
            skillId: 'screen_evidence_eligibility',
          }),
        ]),
      })
    );
    expect(store.saveDiscoveryQueryProgress).toHaveBeenCalledWith({
      queryId: 'query-1',
      sourceCursor: null,
      exhausted: true,
    });
    expect(store.finishDiscoveryRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-1', status: 'SUCCEEDED' })
    );
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      counts: { duplicate: 1, readyForReview: 1, failed: 0 },
    });
  });

  it('persists an ineligible source and its governed exclusion trace without extracting it', async () => {
    const store = repository();
    const upstream = {
      getAssociationReviewContext: vi.fn().mockResolvedValue({
        id: 'association-1',
        approvedLevel: '1',
        gradingRationale: 'Pending independent review.',
        eligibilityTerms: {
          diseases: ['NSCLC'],
          genes: ['EGFR'],
          variants: ['L858R'],
        },
      }),
      findDuplicate: vi.fn().mockResolvedValue(null),
      createCandidateBundle: vi.fn(),
      createCandidateOutcome: vi.fn().mockResolvedValue({
        candidateId: 'candidate-excluded',
        workflowRunId: 'workflow-excluded',
        status: 'EXCLUDED',
      }),
    };
    const generator = { generate: vi.fn() };
    const result = await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: upstream,
      pubmed: {
        previewSearch: vi.fn(),
        searchIncremental: vi.fn(),
        searchPage: vi.fn().mockResolvedValue({
          ids: ['44444444'],
          total: 1,
          nextCursor: null,
        }),
        fetchDocument: vi.fn().mockResolvedValue({
          pmid: '44444444',
          title: 'Topical therapy for psoriasis',
          abstract: 'A dermatology trial without a molecular biomarker.',
          doi: null,
          documentHash: 'excluded-hash',
          url: 'https://pubmed.ncbi.nlm.nih.gov/44444444/',
        }),
      },
      extractionGenerator: generator,
      workflowVersion: 'single-pubmed-v2',
      agentVersion: 'extraction-agent@2.0.0',
    });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(upstream.createCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        associationId: 'association-1',
        status: 'EXCLUDED',
        reason: expect.objectContaining({
          code: 'TARGET_ENTITIES_NOT_FOUND',
          ruleVersion: 'eligibility-v2',
        }),
        skillTraces: [
          expect.objectContaining({
            agentId: 'eligibility-agent',
            skillId: 'screen_evidence_eligibility',
          }),
        ],
      })
    );
    expect(store.recordDiscoveryDocumentOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: '44444444',
        outcome: 'EXCLUDED',
        candidateDocumentId: 'candidate-excluded',
      })
    );
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      counts: { excluded: 1, failed: 0 },
    });
  });

  it('routes a same-gene different-variant source to human review without extraction', async () => {
    const store = repository();
    const upstream = {
      getAssociationReviewContext: vi.fn().mockResolvedValue({
        id: 'association-egfr-l858r',
        approvedLevel: '1',
        gradingRationale: 'Pending independent review.',
        eligibilityTerms: {
          diseases: ['NSCLC'],
          genes: ['EGFR'],
          variants: ['L858R'],
        },
      }),
      findDuplicate: vi.fn().mockResolvedValue(null),
      createCandidateBundle: vi.fn(),
      createCandidateOutcome: vi.fn().mockResolvedValue({
        candidateId: 'candidate-needs-human',
        workflowRunId: 'workflow-needs-human',
        status: 'NEEDS_HUMAN',
      }),
    };
    const generator = { generate: vi.fn() };

    await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: upstream,
      pubmed: {
        previewSearch: vi.fn(),
        searchIncremental: vi.fn(),
        searchPage: vi.fn().mockResolvedValue({
          ids: ['45454545'],
          total: 1,
          nextCursor: null,
        }),
        fetchDocument: vi.fn().mockResolvedValue({
          pmid: '45454545',
          title: 'Osimertinib in EGFR T790M NSCLC',
          abstract: 'Patients with EGFR T790M-positive NSCLC were enrolled.',
          doi: null,
          documentHash: 'different-variant-hash',
          url: 'https://pubmed.ncbi.nlm.nih.gov/45454545/',
        }),
      },
      extractionGenerator: generator,
      workflowVersion: 'single-pubmed-v3',
      agentVersion: 'extraction-agent@2.0.0',
    });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(upstream.createCandidateBundle).not.toHaveBeenCalled();
    expect(upstream.createCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        associationId: 'association-egfr-l858r',
        status: 'NEEDS_HUMAN',
        reason: expect.objectContaining({
          code: 'TARGET_VARIANT_NOT_FOUND',
          ruleVersion: 'eligibility-v2',
        }),
      })
    );
  });

  it('creates an auditable failed candidate when metadata fetching fails before extraction', async () => {
    const store = repository();
    const upstream = {
      getAssociationReviewContext: vi.fn(),
      findDuplicate: vi.fn(),
      createCandidateBundle: vi.fn(),
      createCandidateOutcome: vi.fn().mockResolvedValue({
        candidateId: 'candidate-failed',
        workflowRunId: 'workflow-failed',
        status: 'FAILED',
      }),
    };
    const failure = Object.assign(new Error('PubMed unavailable'), {
      code: 'PUBMED_FETCH_FAILED',
    });
    await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: upstream,
      pubmed: {
        previewSearch: vi.fn(),
        searchIncremental: vi.fn(),
        searchPage: vi.fn().mockResolvedValue({
          ids: ['55555555'],
          total: 1,
          nextCursor: null,
        }),
        fetchDocument: vi.fn().mockRejectedValue(failure),
      },
      extractionGenerator: { generate: vi.fn() },
      workflowVersion: 'single-pubmed-v2',
      agentVersion: 'extraction-agent@2.0.0',
    });

    expect(upstream.createCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        associationId: 'association-1',
        source: expect.objectContaining({ pmid: '55555555' }),
        status: 'FAILED',
        reason: expect.objectContaining({
          code: 'PUBMED_FETCH_FAILED',
          stage: 'fetch_pubmed_metadata',
          retryable: true,
        }),
        failedStep: expect.objectContaining({
          stepKey: 'fetch_pubmed_metadata',
          attempt: 1,
          errorCode: 'PUBMED_FETCH_FAILED',
        }),
      })
    );
    expect(store.recordDiscoveryDocumentOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: '55555555',
        outcome: 'FAILED',
        candidateDocumentId: 'candidate-failed',
      })
    );
  });

  it('stops safely when a pause is observed before fetching another page', async () => {
    const store = repository();
    store.getDiscoveryRunStatus = vi.fn().mockResolvedValue('PAUSED');
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn(),
      fetchDocument: vi.fn(),
    };
    await expect(
      processPersistentDiscoveryRun({
        runId: 'run-1',
        repository: store,
        upstreamRepository: {} as never,
        pubmed,
        extractionGenerator: {} as never,
        workflowVersion: 'single-pubmed-v2',
        agentVersion: 'extraction-agent@2.0.0',
      })
    ).resolves.toEqual({ status: 'PAUSED' });
    expect(pubmed.searchPage).not.toHaveBeenCalled();
    expect(store.finishDiscoveryRun).not.toHaveBeenCalled();
  });

  it.each(['CANCELLED', 'FAILED'] as const)(
    'stops before source work when run control reports %s',
    async (control) => {
      const store = repository();
      store.getDiscoveryRunStatus = vi.fn().mockResolvedValue(control);
      const pubmed = {
        previewSearch: vi.fn(),
        searchIncremental: vi.fn(),
        searchPage: vi.fn(),
        fetchDocument: vi.fn(),
      };
      await expect(
        processPersistentDiscoveryRun({
          runId: 'run-1',
          repository: store,
          upstreamRepository: {} as never,
          pubmed,
          extractionGenerator: {} as never,
          workflowVersion: 'single-pubmed-v2',
          agentVersion: 'extraction-agent@2.0.0',
        })
      ).resolves.toEqual({
        status: control === 'CANCELLED' ? 'CANCELLED' : 'NOT_RUNNABLE',
      });
      expect(pubmed.searchPage).not.toHaveBeenCalled();
    }
  );

  it('honors a run-level limit before requesting another source page', async () => {
    const store = repository();
    const plan = await store.beginDiscoveryRun('run-1');
    store.beginDiscoveryRun = vi.fn().mockResolvedValue({
      ...plan,
      run: {
        ...plan!.run,
        documentLimit: 50,
        uniqueDiscoveredCount: 50,
      },
    });
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn(),
      fetchDocument: vi.fn(),
    };
    await expect(
      processPersistentDiscoveryRun({
        runId: 'run-1',
        repository: store,
        upstreamRepository: {} as never,
        pubmed,
        extractionGenerator: {} as never,
        workflowVersion: 'single-pubmed-v2',
        agentVersion: 'extraction-agent@2.0.0',
      })
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      uniqueDiscoveredCount: 50,
    });
    expect(pubmed.searchPage).not.toHaveBeenCalled();
  });

  it('skips already claimed documents and stops when a concurrent limit is reached', async () => {
    const store = repository();
    store.claimDiscoveryDocument = vi
      .fn()
      .mockResolvedValueOnce({
        shouldProcess: false,
        limitReached: false,
        uniqueDiscoveredCount: 1,
      })
      .mockResolvedValueOnce({
        shouldProcess: false,
        limitReached: true,
        uniqueDiscoveredCount: 2,
      });
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn().mockResolvedValue({
        ids: ['11111111', '22222222'],
        total: 2,
        nextCursor: null,
      }),
      fetchDocument: vi.fn(),
    };
    await expect(
      processPersistentDiscoveryRun({
        runId: 'run-1',
        repository: store,
        upstreamRepository: {} as never,
        pubmed,
        extractionGenerator: {} as never,
        workflowVersion: 'single-pubmed-v2',
        agentVersion: 'extraction-agent@2.0.0',
      })
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(pubmed.fetchDocument).not.toHaveBeenCalled();
  });

  it('records typed document failures and marks a mixed run partial', async () => {
    const store = repository();
    const upstream = {
      getAssociationReviewContext: vi.fn(),
      findDuplicate: vi
        .fn()
        .mockResolvedValueOnce({ candidateId: 'candidate-existing' }),
      createCandidateBundle: vi.fn(),
    };
    const sourceFailure = { code: 'PUBMED_FETCH_FAILED' };
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn().mockResolvedValue({
        ids: ['11111111', '22222222'],
        total: 2,
        nextCursor: null,
      }),
      fetchDocument: vi
        .fn()
        .mockResolvedValueOnce({
          pmid: '11111111',
          title: 'Existing study',
          abstract: 'Already known.',
          doi: null,
          documentHash: 'existing-hash',
          url: 'https://pubmed.ncbi.nlm.nih.gov/11111111/',
        })
        .mockRejectedValueOnce(sourceFailure),
    };
    const result = await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: upstream,
      pubmed,
      extractionGenerator: {} as never,
      workflowVersion: 'single-pubmed-v2',
      agentVersion: 'extraction-agent@2.0.0',
    });
    expect(store.recordDiscoveryDocumentOutcome).toHaveBeenLastCalledWith({
      runId: 'run-1',
      externalId: '22222222',
      outcome: 'FAILED',
      errorCode: 'PUBMED_FETCH_FAILED',
      errorSummary: 'Unknown candidate error',
    });
    expect(store.finishDiscoveryRun).toHaveBeenCalledWith({
      runId: 'run-1',
      status: 'PARTIAL_SUCCESS',
      errorCode: 'CANDIDATE_PROCESSING_FAILED',
      errorSummary: 'Unknown candidate error',
    });
    expect(result).toMatchObject({
      status: 'PARTIAL_SUCCESS',
      counts: { duplicate: 1, failed: 1 },
    });
  });

  it('fails a run when the configured association cannot be reviewed', async () => {
    const store = repository();
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn().mockResolvedValue({
        ids: ['33333333'],
        total: 1,
        nextCursor: null,
      }),
      fetchDocument: vi.fn().mockResolvedValue({
        pmid: '33333333',
        title: 'Unconfigured study',
        abstract: 'Association is no longer available.',
        doi: null,
        documentHash: 'missing-association-hash',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33333333/',
      }),
    };
    const result = await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: {
        getAssociationReviewContext: vi.fn().mockResolvedValue(null),
        findDuplicate: vi.fn().mockResolvedValue(null),
        createCandidateBundle: vi.fn(),
      },
      pubmed,
      extractionGenerator: {} as never,
      workflowVersion: 'single-pubmed-v2',
      agentVersion: 'extraction-agent@2.0.0',
    });
    expect(result).toMatchObject({ status: 'FAILED', counts: { failed: 1 } });
  });

  it('paginates an unlimited run with a bounded source page size', async () => {
    const store = repository();
    const plan = await store.beginDiscoveryRun('run-1');
    store.beginDiscoveryRun = vi.fn().mockResolvedValue({
      ...plan,
      run: { ...plan!.run, documentLimit: null },
    });
    store.claimDiscoveryDocument = vi.fn().mockResolvedValue({
      shouldProcess: false,
      limitReached: false,
      uniqueDiscoveredCount: 0,
    });
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi
        .fn()
        .mockResolvedValueOnce({
          ids: ['11111111'],
          total: 1,
          nextCursor: '1',
        })
        .mockResolvedValueOnce({ ids: [], total: 1, nextCursor: null }),
      fetchDocument: vi.fn(),
    };
    await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: {} as never,
      pubmed,
      extractionGenerator: {} as never,
      workflowVersion: 'single-pubmed-v2',
      agentVersion: 'extraction-agent@2.0.0',
      pageSize: 500,
    });
    expect(pubmed.searchPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: '1', pageSize: 200 })
    );
    expect(store.saveDiscoveryQueryProgress).toHaveBeenCalledTimes(2);
  });

  it('uses CIViC only for discovery, records EID provenance, then fetches the original PubMed document', async () => {
    const store = repository();
    const plan = await store.beginDiscoveryRun('run-1');
    store.beginDiscoveryRun = vi.fn().mockResolvedValue({
      ...plan,
      run: { ...plan!.run, source: 'CIVIC' },
    });
    const provenance = {
      source: 'CIVIC' as const,
      retrievedAt: '2026-09-16T12:00:00.000Z',
      query: {
        version: 1 as const,
        diseaseId: 'disease_nsclc',
        variantId: 'variant_egfr_l858r',
        geneSymbol: 'EGFR',
        profileName: 'L858R',
        diseaseName: 'Lung Non-small Cell Carcinoma',
      },
      evidenceItems: [
        {
          eid: 2994,
          name: 'EID2994',
          molecularProfile: 'EGFR L858R',
          disease: 'Lung Non-small Cell Carcinoma',
          diseaseDoid: '3908',
          therapies: ['Erlotinib'],
          evidenceLevel: 'A',
          evidenceDirection: 'SUPPORTS',
          significance: 'SENSITIVITYRESPONSE',
          citation: 'Khozin et al., 2014',
          publicationYear: 2014,
          applicability: 'EXACT' as const,
        },
      ],
    };
    const civic = {
      previewSearch: vi.fn(),
      searchPage: vi.fn().mockResolvedValue({
        ids: ['24868098'],
        total: 1,
        nextCursor: null,
        provenanceById: { '24868098': provenance },
      }),
    };
    const pubmed = {
      previewSearch: vi.fn(),
      searchIncremental: vi.fn(),
      searchPage: vi.fn(),
      fetchDocument: vi.fn().mockResolvedValue({
        pmid: '24868098',
        title: 'Original PubMed article',
        abstract: 'EGFR L858R NSCLC was treated with erlotinib.',
        doi: null,
        documentHash: 'civic-seeded-pubmed-hash',
        url: 'https://pubmed.ncbi.nlm.nih.gov/24868098/',
      }),
    };
    const upstream = {
      getAssociationReviewContext: vi.fn(),
      findDuplicate: vi
        .fn()
        .mockResolvedValue({ candidateId: 'candidate-existing' }),
      createCandidateBundle: vi.fn(),
    };

    await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: upstream,
      pubmed,
      civic,
      extractionGenerator: {} as never,
      workflowVersion: 'single-pubmed-v3',
      agentVersion: 'extraction-agent@2.0.0',
    });

    expect(civic.searchPage).toHaveBeenCalledTimes(1);
    expect(pubmed.searchPage).not.toHaveBeenCalled();
    expect(pubmed.fetchDocument).toHaveBeenCalledWith('24868098');
    expect(store.recordDiscoveryProvenance).toHaveBeenCalledWith({
      runId: 'run-1',
      externalId: '24868098',
      strategyId: 'strategy-1',
      provenance,
    });
    expect(upstream.findDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'PUBMED', externalId: '24868098' })
    );
  });

  it('fails closed to human review when a CIViC therapy does not match the strategy association', async () => {
    const store = repository();
    const plan = await store.beginDiscoveryRun('run-1');
    store.beginDiscoveryRun = vi.fn().mockResolvedValue({
      ...plan,
      run: { ...plan!.run, source: 'CIVIC' },
    });
    const generator = { generate: vi.fn() };
    const createCandidateOutcome = vi.fn().mockResolvedValue({
      candidateId: 'candidate-needs-human',
      workflowRunId: 'workflow-needs-human',
      status: 'NEEDS_HUMAN',
    });

    await processPersistentDiscoveryRun({
      runId: 'run-1',
      repository: store,
      upstreamRepository: {
        getAssociationReviewContext: vi.fn().mockResolvedValue({
          id: 'association-osimertinib',
          approvedLevel: '1',
          gradingRationale: 'Reviewed association.',
          therapyNames: ['osimertinib'],
          eligibilityTerms: {
            diseases: ['NSCLC'],
            genes: ['EGFR'],
            variants: ['L858R'],
          },
        }),
        findDuplicate: vi.fn().mockResolvedValue(null),
        createCandidateBundle: vi.fn(),
        createCandidateOutcome,
      },
      pubmed: {
        previewSearch: vi.fn(),
        searchIncremental: vi.fn(),
        searchPage: vi.fn(),
        fetchDocument: vi.fn().mockResolvedValue({
          pmid: '24868098',
          title: 'Erlotinib in EGFR L858R NSCLC',
          abstract: 'EGFR L858R NSCLC was treated with erlotinib.',
          doi: null,
          documentHash: 'therapy-mismatch-hash',
          url: 'https://pubmed.ncbi.nlm.nih.gov/24868098/',
        }),
      },
      civic: {
        previewSearch: vi.fn(),
        searchPage: vi.fn().mockResolvedValue({
          ids: ['24868098'],
          total: 1,
          nextCursor: null,
          provenanceById: {
            '24868098': {
              source: 'CIVIC',
              retrievedAt: '2026-09-16T12:00:00.000Z',
              query: {
                version: 1,
                diseaseId: 'disease_nsclc',
                variantId: 'variant_egfr_l858r',
                geneSymbol: 'EGFR',
                profileName: 'L858R',
                diseaseName: 'Lung Non-small Cell Carcinoma',
              },
              evidenceItems: [
                {
                  eid: 2994,
                  name: 'EID2994',
                  molecularProfile: 'EGFR L858R',
                  disease: 'Lung Non-small Cell Carcinoma',
                  diseaseDoid: '3908',
                  therapies: ['Erlotinib'],
                  evidenceLevel: 'A',
                  evidenceDirection: 'SUPPORTS',
                  significance: 'SENSITIVITYRESPONSE',
                  citation: 'Khozin et al., 2014',
                  publicationYear: 2014,
                  applicability: 'EXACT',
                },
              ],
            },
          },
        }),
      },
      extractionGenerator: generator,
      workflowVersion: 'single-pubmed-v3',
      agentVersion: 'extraction-agent@2.0.0',
    });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(createCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'NEEDS_HUMAN',
        associationId: 'association-osimertinib',
        reason: expect.objectContaining({
          code: 'CIVIC_THERAPY_ASSOCIATION_REVIEW_REQUIRED',
          stage: 'verify_civic_association',
        }),
      })
    );
  });
});
