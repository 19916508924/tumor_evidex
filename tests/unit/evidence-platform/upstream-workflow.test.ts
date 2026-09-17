import { describe, expect, it, vi } from 'vitest';

import {
  submitPubmedAssociationCandidate,
  submitPubmedCandidate,
  type CandidateBundle,
  type CandidateSourceInput,
  type EvidenceDraftInput,
  type UpstreamWorkflowRepository,
} from '@/shared/services/evidence-platform/upstream-workflow';

const source: CandidateSourceInput = {
  pmid: '12345678',
  title: 'A prospective EGFR study',
  abstract: 'This study reports a reviewed progression-free survival result.',
  doi: ' HTTPS://DOI.ORG/10.1000/ABC.1 ',
  documentHash: 'doc-sha256',
  publicationDate: '2026-09-01',
  journal: 'Journal of Evidence',
  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
};

const draft: EvidenceDraftInput = {
  associationId: 'assoc-egfr-l858r-osimertinib',
  proposedLevel: '1',
  gradingRationale: 'Agent proposal; requires human approval.',
  passages: [
    {
      id: 'passage-12345678-primary',
      text: 'The primary endpoint was progression-free survival.',
      textHash: 'passage-sha256',
      section: 'Abstract',
      paragraphIndex: 0,
      displayPolicy: 'EXCERPT',
      modelUsePolicy: 'ALLOWED',
      supportRole: 'PRIMARY',
    },
  ],
  claims: [
    {
      id: 'claim-12345678-pfs',
      claimType: 'EFFICACY',
      evidenceMaturity: 'MATURE_CLINICAL',
      studyType: 'prospective trial',
      studyName: 'Evidence study',
      populationSummary: 'Advanced NSCLC with EGFR p.L858R',
      sampleSize: 100,
      diseaseStage: 'advanced',
      treatmentLine: 'first-line',
      priorTherapy: 'none',
      intervention: 'osimertinib',
      comparator: 'control',
      endpoint: 'PFS',
      effectValue: { hazardRatio: 0.5 },
      conclusion: 'The study reported longer PFS.',
      limitations: 'Single study.',
      passageIds: ['passage-12345678-primary'],
    },
  ],
  fieldProvenance: {
    'claims.0.endpoint': ['passage-12345678-primary'],
  },
  qaIssues: [],
};

function repository(
  duplicate: CandidateBundle | null = null
): UpstreamWorkflowRepository & {
  findDuplicate: ReturnType<typeof vi.fn>;
  createCandidateBundle: ReturnType<typeof vi.fn>;
} {
  return {
    getAssociationReviewContext: vi.fn(),
    findDuplicate: vi.fn().mockResolvedValue(duplicate),
    createCandidateBundle: vi.fn().mockImplementation(async ({ ids }) => ({
      ...ids,
      draftVersion: 1,
      status: 'READY_FOR_REVIEW',
      duplicate: false,
    })),
  };
}

describe('single PubMed candidate workflow', () => {
  it('normalizes identity and creates one auditable review bundle', async () => {
    const store = repository();
    const ids = ['candidate-1', 'workflow-1', 'draft-1', 'review-1'];
    const result = await submitPubmedCandidate({
      source,
      draft,
      repository: store,
      workflowVersion: 'single-pubmed-v1',
      agentVersion: 'extraction-agent@1.0.0',
      skillVersions: ['extract_evidence_claims@1.0.0'],
      createId: () => ids.shift()!,
    });

    expect(store.findDuplicate).toHaveBeenCalledWith({
      sourceType: 'PUBMED',
      externalId: '12345678',
      doi: '10.1000/abc.1',
      documentHash: 'doc-sha256',
    });
    expect(store.createCandidateBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ doi: '10.1000/abc.1' }),
        ids: {
          candidateId: 'candidate-1',
          workflowRunId: 'workflow-1',
          draftId: 'draft-1',
          reviewTaskId: 'review-1',
        },
      })
    );
    expect(result).toMatchObject({
      candidateId: 'candidate-1',
      draftVersion: 1,
      status: 'READY_FOR_REVIEW',
      duplicate: false,
    });
  });

  it('returns the master candidate for a duplicate without creating work', async () => {
    const existing: CandidateBundle = {
      candidateId: 'candidate-master',
      workflowRunId: 'workflow-master',
      draftId: 'draft-master',
      draftVersion: 2,
      reviewTaskId: 'review-master',
      status: 'READY_FOR_REVIEW',
      duplicate: false,
    };
    const store = repository(existing);

    await expect(
      submitPubmedCandidate({
        source: { ...source, pmid: '87654321' },
        draft,
        repository: store,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
      })
    ).resolves.toEqual({ ...existing, duplicate: true });
    expect(store.createCandidateBundle).not.toHaveBeenCalled();
  });

  it('adds a new association draft to an existing PMID without duplicating the source candidate', async () => {
    const existing: CandidateBundle = {
      candidateId: 'candidate-master',
      workflowRunId: 'workflow-old',
      draftId: null,
      draftVersion: null,
      reviewTaskId: null,
      status: 'NEEDS_HUMAN',
      duplicate: false,
    };
    const store = {
      ...repository(existing),
      findCandidateAssociationDraft: vi.fn().mockResolvedValue(null),
      createCandidateAssociationBundle: vi
        .fn()
        .mockImplementation(async ({ candidateId, ids }) => ({
          candidateId,
          ...ids,
          draftVersion: 1,
          status: 'READY_FOR_REVIEW',
          duplicate: false,
        })),
    };
    const ids = ['workflow-new', 'draft-new', 'review-new'];

    const result = await submitPubmedAssociationCandidate({
      source,
      draft,
      repository: store,
      workflowVersion: 'single-pubmed-v4',
      agentVersion: 'extraction-agent@1.0.0',
      skillVersions: ['extract_evidence_claims@1.0.0'],
      createId: () => ids.shift()!,
    });

    expect(store.findCandidateAssociationDraft).toHaveBeenCalledWith(
      'candidate-master',
      'assoc-egfr-l858r-osimertinib'
    );
    expect(store.createCandidateBundle).not.toHaveBeenCalled();
    expect(store.createCandidateAssociationBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-master',
        ids: {
          workflowRunId: 'workflow-new',
          draftId: 'draft-new',
          reviewTaskId: 'review-new',
        },
      })
    );
    expect(result).toMatchObject({
      candidateId: 'candidate-master',
      status: 'READY_FOR_REVIEW',
      duplicate: false,
    });
  });

  it('creates the first source bundle when an association-aware submission is new', async () => {
    const store = repository();
    const ids = ['candidate-new', 'workflow-new', 'draft-new', 'review-new'];

    await expect(
      submitPubmedAssociationCandidate({
        source,
        draft,
        repository: store,
        workflowVersion: 'single-pubmed-v4',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
        createId: () => ids.shift()!,
      })
    ).resolves.toMatchObject({
      candidateId: 'candidate-new',
      draftVersion: 1,
      duplicate: false,
    });
    expect(store.createCandidateBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: {
          candidateId: 'candidate-new',
          workflowRunId: 'workflow-new',
          draftId: 'draft-new',
          reviewTaskId: 'review-new',
        },
      })
    );
  });

  it('fails closed when an existing source cannot persist association-specific drafts', async () => {
    const store = repository({
      candidateId: 'candidate-existing',
      workflowRunId: null,
      draftId: null,
      draftVersion: null,
      reviewTaskId: null,
      status: 'NEEDS_HUMAN',
      duplicate: false,
    });

    await expect(
      submitPubmedAssociationCandidate({
        source,
        draft,
        repository: store,
        workflowVersion: 'single-pubmed-v4',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
      })
    ).rejects.toThrow(/association-aware candidate repository/i);
  });

  it('does not create another draft when the PMID and association are already staged', async () => {
    const existing: CandidateBundle = {
      candidateId: 'candidate-master',
      workflowRunId: 'workflow-existing',
      draftId: 'draft-existing',
      draftVersion: 3,
      reviewTaskId: 'review-existing',
      status: 'READY_FOR_REVIEW',
      duplicate: false,
    };
    const store = {
      ...repository(existing),
      findCandidateAssociationDraft: vi.fn().mockResolvedValue(existing),
      createCandidateAssociationBundle: vi.fn(),
    };

    await expect(
      submitPubmedAssociationCandidate({
        source,
        draft,
        repository: store,
        workflowVersion: 'single-pubmed-v4',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
      })
    ).resolves.toEqual({ ...existing, duplicate: true });
    expect(store.createCandidateAssociationBundle).not.toHaveBeenCalled();
  });

  it('rejects unsafe or incomplete drafts before any database write', async () => {
    const store = repository();

    await expect(
      submitPubmedCandidate({
        source: { ...source, pmid: 'not-a-pmid' },
        draft,
        repository: store,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
      })
    ).rejects.toThrow(/PMID/i);

    await expect(
      submitPubmedCandidate({
        source,
        draft: {
          ...draft,
          passages: [{ ...draft.passages[0], modelUsePolicy: 'PROHIBITED' }],
        },
        repository: store,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
      })
    ).rejects.toThrow(/PRIMARY.*ALLOWED/i);

    await expect(
      submitPubmedCandidate({
        source,
        draft: {
          ...draft,
          qaIssues: [
            {
              code: 'ASSOCIATION_MISMATCH',
              severity: 'BLOCKING',
              message: 'The abstract does not support the target association.',
            },
          ],
        },
        repository: store,
        workflowVersion: 'single-pubmed-v1',
        agentVersion: 'extraction-agent@1.0.0',
        skillVersions: [],
      })
    ).rejects.toThrow(/BLOCKING/i);
    expect(store.createCandidateBundle).not.toHaveBeenCalled();
  });
});
