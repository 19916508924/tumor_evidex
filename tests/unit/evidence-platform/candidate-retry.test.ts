import { describe, expect, it, vi } from 'vitest';

import { processCandidateRetry } from '@/shared/services/evidence-platform/candidate-retry';

describe('candidate retry worker', () => {
  it('fails closed when durable retry repository methods are unavailable', async () => {
    await expect(
      processCandidateRetry({
        candidateId: 'candidate-1',
        repository: {
          getAssociationReviewContext: vi.fn(),
          findDuplicate: vi.fn(),
          createCandidateBundle: vi.fn(),
        },
        generator: { generate: vi.fn() },
        agentVersion: 'extraction-agent@1.0.0',
        pubmed: {} as never,
      })
    ).rejects.toThrow('Candidate retry repository is not configured');
  });

  it('re-enters the governed extraction workflow and saves a new draft version', async () => {
    const repository = {
      getAssociationReviewContext: vi.fn(),
      findDuplicate: vi.fn(),
      createCandidateBundle: vi.fn(),
      getCandidateRetryContext: vi.fn().mockResolvedValue({
        source: {
          pmid: '12345678',
          title: 'EGFR retry study',
          abstract: 'A retryable NSCLC abstract.',
          doi: null,
          documentHash: 'retry-hash',
          url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
        },
        association: {
          id: 'association-1',
          approvedLevel: '1',
          gradingRationale: 'Historical grade.',
          eligibilityTerms: {
            diseases: ['NSCLC'],
            genes: ['EGFR'],
            variants: [],
          },
        },
      }),
      saveCandidateRetry: vi.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        draftVersion: 2,
        status: 'READY_FOR_REVIEW',
      }),
    };
    const result = await processCandidateRetry({
      candidateId: 'candidate-1',
      repository,
      generator: {
        generate: vi.fn().mockResolvedValue({
          claims: [
            {
              claimType: 'EFFICACY',
              evidenceMaturity: 'LIMITED_CLINICAL',
              studyType: 'cohort',
              studyName: null,
              populationSummary: 'NSCLC',
              sampleSize: 12,
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
      agentVersion: 'extraction-agent@1.0.0',
      pubmed: {} as never,
    });
    expect(repository.saveCandidateRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        source: expect.objectContaining({ pmid: '12345678' }),
        draft: expect.objectContaining({ proposedLevel: '3B' }),
        skillVersions: expect.arrayContaining([
          'screen_evidence_eligibility@2.0.0',
          'extract_evidence_claims@1.0.0',
          'recognize_evidence_entities@2.0.0',
          'normalize_evidence_entities@2.0.0',
          'extract_treatment_relationship@2.0.0',
          'propose_evidence_level@1.0.0',
          'validate_draft_completeness@1.0.0',
        ]),
        skillTraces: expect.arrayContaining([
          expect.objectContaining({ skillId: 'extract_evidence_claims' }),
        ]),
      })
    );
    expect(result).toMatchObject({ draftVersion: 2 });
  });

  it('refetches metadata for a candidate that failed before source creation', async () => {
    const repository = {
      getAssociationReviewContext: vi.fn(),
      findDuplicate: vi.fn(),
      createCandidateBundle: vi.fn(),
      getCandidateRetryContext: vi.fn().mockResolvedValue({
        pmid: '87654321',
        source: null,
        association: {
          id: 'association-1',
          approvedLevel: '1',
          gradingRationale: 'Historical grade.',
          eligibilityTerms: {
            diseases: ['NSCLC'],
            genes: ['EGFR'],
            variants: [],
          },
        },
      }),
      saveCandidateRetry: vi.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        draftVersion: 1,
        status: 'READY_FOR_REVIEW',
      }),
    };
    const fetched = {
      pmid: '87654321',
      title: 'EGFR study in NSCLC',
      abstract: 'EGFR was evaluated in NSCLC. Response was observed.',
      doi: null,
      documentHash: 'retry-source-hash',
      url: 'https://pubmed.ncbi.nlm.nih.gov/87654321/',
    };
    const pubmed = { fetchDocument: vi.fn().mockResolvedValue(fetched) };

    await processCandidateRetry({
      candidateId: 'candidate-1',
      repository,
      pubmed: pubmed as never,
      generator: {
        generate: vi.fn().mockResolvedValue({
          claims: [
            {
              claimType: 'EFFICACY',
              evidenceMaturity: 'LIMITED_CLINICAL',
              studyType: 'cohort',
              studyName: null,
              populationSummary: 'NSCLC',
              sampleSize: 12,
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
      agentVersion: 'extraction-agent@1.0.0',
    });

    expect(pubmed.fetchDocument).toHaveBeenCalledWith('87654321');
    expect(repository.saveCandidateRetry).toHaveBeenCalledWith(
      expect.objectContaining({ source: fetched, candidateId: 'candidate-1' })
    );
  });

  it('treats an already-finished retry as idempotent', async () => {
    await expect(
      processCandidateRetry({
        candidateId: 'candidate-1',
        repository: {
          getAssociationReviewContext: vi.fn(),
          findDuplicate: vi.fn(),
          createCandidateBundle: vi.fn(),
          getCandidateRetryContext: vi.fn().mockResolvedValue(null),
          saveCandidateRetry: vi.fn(),
        },
        generator: { generate: vi.fn() },
        agentVersion: 'extraction-agent@1.0.0',
        pubmed: {} as never,
      })
    ).resolves.toEqual({
      candidateId: 'candidate-1',
      status: 'ALREADY_PROCESSED',
    });
  });
});
