import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerEvidenceQuery,
  type EvidenceAnswerDependencies,
} from '@/shared/services/evidence/answer-evidence-query';
import type {
  EvidenceAnswerDraft,
  EvidenceResultGroup,
  KnowledgeReleaseInfo,
} from '@/shared/types/evidence';

const request = {
  disease: 'NSCLC',
  biomarkers: [{ gene: 'EGFR', alterationType: 'SNV', hgvsp: 'p.L858R' }],
  jurisdiction: 'US',
  locale: 'zh-CN',
};

const release: KnowledgeReleaseInfo = {
  id: 'release-1',
  version: 'v0.1.0',
  literatureCutoffAt: '2026-09-01T00:00:00.000Z',
  regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
  gradingRuleVersion: 'evidex-therapeutic-v1',
};

const resultGroups = [
  {
    scope: 'SAME_DISEASE',
    therapies: [
      {
        associationId: 'assoc-direct',
        sourceDisease: {
          id: 'disease-nsclc',
          canonicalName: 'NSCLC',
          displayNameZh: '非小细胞肺癌',
          displayNameEn: 'Non-small cell lung cancer',
          lineage: 'SOLID',
        },
        variant: {
          id: 'variant-l858r',
          gene: 'EGFR',
          alterationType: 'SNV',
          hgvsp: 'p.L858R',
          canonicalKey: 'EGFR|SNV|p.L858R',
          applicability: 'EXACT',
        },
        drugs: [
          {
            id: 'drug-1',
            genericName: 'osimertinib',
            displayNameZh: '奥希替尼',
            displayNameEn: 'osimertinib',
            role: 'PRIMARY',
            sortOrder: 0,
          },
        ],
        direction: 'SENSITIVITY',
        approvedLevel: '1',
        sourceApprovedLevel: '1',
        gradingRationale: 'reviewed',
        regulatoryAlignment: 'MATCHED_INDICATION',
        regulatoryApprovals: [
          {
            id: 'approval-direct',
            authority: 'FDA',
            applicationNumber: '208065',
            approvalStatus: 'APPROVED',
            approvalDate: '2015-11-13',
            statusAsOf: '2026-09-01',
            indicationText: 'reviewed indication',
            biomarkerText: 'EGFR L858R',
            source: {
              id: 'source-fda',
              sourceType: 'FDA',
              externalId: '208065',
              title: 'FDA label',
              url: 'https://www.accessdata.fda.gov/example',
            },
          },
        ],
        evidenceClaims: [
          {
            id: 'evidence-direct',
            claimType: 'EFFICACY',
            evidenceMaturity: 'MATURE_CLINICAL',
            studyType: 'trial',
            studyName: 'Study A',
            populationSummary: 'advanced NSCLC',
            sampleSize: 100,
            diseaseStage: 'advanced',
            treatmentLine: 'first-line',
            priorTherapy: 'none',
            intervention: 'osimertinib',
            comparator: null,
            endpoint: 'PFS',
            effectValue: null,
            conclusion: 'reviewed conclusion',
            limitations: 'reviewed limitation',
            passages: [
              {
                id: 'passage-primary',
                source: {
                  id: 'source-pubmed',
                  sourceType: 'PUBMED',
                  externalId: '12345678',
                  title: 'Study A',
                  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
                },
                section: 'Abstract',
                paragraphIndex: 1,
                locator: {},
                originalText: 'Reviewed model context.',
                publicExcerpt: 'Public excerpt.',
                displayPolicy: 'EXCERPT',
                modelUsePolicy: 'ALLOWED',
                supportRole: 'PRIMARY',
              },
            ],
          },
        ],
      },
    ],
  },
  { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
] as EvidenceResultGroup[];

const draft: EvidenceAnswerDraft = {
  overallSummary: '循证综述。',
  groups: [
    {
      scope: 'SAME_DISEASE',
      therapies: [
        {
          associationId: 'assoc-direct',
          overview: '同疾病证据。',
          statements: [
            {
              text: '研究报告了相关结局。',
              evidenceIds: ['evidence-direct'],
              regulatoryApprovalIds: ['approval-direct'],
            },
          ],
          limitations: ['未提供完整临床信息。'],
        },
      ],
    },
    { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
  ],
  overallLimitations: ['不构成医疗建议。'],
};

const repository = {
  getPublishedRelease: vi.fn(),
  retrieveEvidence: vi.fn(),
  findAnswerSnapshot: vi.fn(),
  saveAnswerSnapshot: vi.fn(),
};
const generator = { generate: vi.fn() };
const logError = vi.fn();

const dependencies: EvidenceAnswerDependencies = {
  repository,
  generator,
  promptVersion: 'evidex-answer-v1',
  provider: 'openrouter',
  model: 'test-model',
  now: () => new Date('2026-09-09T08:00:00.000Z'),
  logError,
};

describe('answerEvidenceQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getPublishedRelease.mockResolvedValue(release);
    repository.retrieveEvidence.mockResolvedValue(resultGroups);
    repository.findAnswerSnapshot.mockResolvedValue(null);
    repository.saveAnswerSnapshot.mockResolvedValue(undefined);
    generator.generate.mockResolvedValue(draft);
  });

  it('generates, validates and saves an answer snapshot', async () => {
    const result = await answerEvidenceQuery(request, dependencies);

    expect(result).toMatchObject({
      status: 'ANSWERED',
      normalizedInput: { hgvsp: 'p.L858R' },
      knowledge: { release: 'v0.1.0' },
      answer: draft,
      resultGroups: [
        {
          scope: 'SAME_DISEASE',
          therapies: [
            {
              evidenceClaims: [
                {
                  passages: [{ text: 'Public excerpt.' }],
                },
              ],
            },
          ],
        },
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
      ],
      generatedAt: '2026-09-09T08:00:00.000Z',
      cached: false,
    });
    expect(generator.generate).toHaveBeenCalledOnce();
    expect(repository.saveAnswerSnapshot).toHaveBeenCalledOnce();
  });

  it.each([
    [{}, 'INVALID_INPUT'],
    [{ ...request, disease: 'melanoma' }, 'OUT_OF_SCOPE'],
  ])(
    'short-circuits %s without database or model work',
    async (input, status) => {
      expect(await answerEvidenceQuery(input, dependencies)).toMatchObject({
        status,
      });
      expect(repository.getPublishedRelease).not.toHaveBeenCalled();
      expect(generator.generate).not.toHaveBeenCalled();
    }
  );

  it('returns service unavailability when no published release exists', async () => {
    repository.getPublishedRelease.mockResolvedValue(null);
    expect(await answerEvidenceQuery(request, dependencies)).toEqual({
      status: 'KNOWLEDGE_RELEASE_UNAVAILABLE',
    });
    expect(repository.retrieveEvidence).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('turns database retrieval failures into service unavailability', async () => {
    const trace = vi.fn();
    repository.retrieveEvidence.mockRejectedValue(new Error('database'));
    expect(
      await answerEvidenceQuery(request, { ...dependencies, trace })
    ).toEqual({ status: 'KNOWLEDGE_RELEASE_UNAVAILABLE' });
    expect(logError).toHaveBeenCalledWith(
      'Failed to retrieve Evidex knowledge',
      expect.any(Error)
    );
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        stepKey: 'build_evidence_pack',
        status: 'FAILED',
        agentVersion: 'evidence-retrieval-agent@1.0.0',
        skillVersion: 'build_evidence_pack@1.0.0',
        errorCode: 'SKILL_EXECUTION_FAILED',
      })
    );
    expect(trace).not.toHaveBeenCalledWith(
      expect.objectContaining({
        stepKey: 'build_retrieval_plan',
        status: 'FAILED',
      })
    );
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('returns NO_CURATED_EVIDENCE without invoking the model', async () => {
    repository.retrieveEvidence.mockResolvedValue([
      { scope: 'SAME_DISEASE', therapies: [] },
      { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
    ]);
    const result = await answerEvidenceQuery(request, dependencies);
    expect(result).toMatchObject({
      status: 'NO_CURATED_EVIDENCE',
      answer: null,
      resultGroups: [
        { scope: 'SAME_DISEASE', therapies: [] },
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
      ],
    });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('uses a valid cached snapshot without invoking the model', async () => {
    repository.findAnswerSnapshot.mockResolvedValue({
      structuredOutput: draft,
      createdAt: '2026-09-08T08:00:00.000Z',
    });
    const result = await answerEvidenceQuery(request, dependencies);
    expect(result).toMatchObject({
      status: 'ANSWERED',
      cached: true,
      generatedAt: '2026-09-08T08:00:00.000Z',
    });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(repository.saveAnswerSnapshot).not.toHaveBeenCalled();
  });

  it('attributes each governed answer step to its role-specific agent', async () => {
    const trace = vi.fn();

    await expect(
      answerEvidenceQuery(request, { ...dependencies, trace })
    ).resolves.toMatchObject({ status: 'ANSWERED' });

    expect(
      trace.mock.calls.map(([entry]) => [entry.stepKey, entry.agentVersion])
    ).toEqual([
      ['normalize_query', 'question-understanding-agent@1.0.0'],
      ['build_retrieval_plan', 'retrieval-planning-agent@1.0.0'],
      ['build_evidence_pack', 'evidence-retrieval-agent@1.0.0'],
      ['analyze_evidence', 'evidence-analysis-agent@1.0.0'],
      ['compose_evidence_answer', 'answer-composition-agent@1.0.0'],
      ['validate_answer', 'answer-qa-agent@1.0.0'],
    ]);
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCEEDED', attempt: 1 })
    );
  });

  it.each(['invalid snapshot', 'snapshot read failure'])(
    'ignores %s and generates a fresh validated answer',
    async (failure) => {
      if (failure === 'invalid snapshot') {
        repository.findAnswerSnapshot.mockResolvedValue({
          structuredOutput: { invalid: true },
          createdAt: '2026-09-08T08:00:00.000Z',
        });
      } else {
        repository.findAnswerSnapshot.mockRejectedValue(new Error('database'));
      }

      expect(await answerEvidenceQuery(request, dependencies)).toMatchObject({
        status: 'ANSWERED',
        cached: false,
      });
      expect(generator.generate).toHaveBeenCalledOnce();
      expect(logError).toHaveBeenCalled();
    }
  );

  it('uses the real clock when no test clock is injected', async () => {
    repository.retrieveEvidence.mockResolvedValue([
      { scope: 'SAME_DISEASE', therapies: [] },
      { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
    ]);
    const result = await answerEvidenceQuery(request, {
      ...dependencies,
      now: undefined,
    });
    expect(result).toMatchObject({ status: 'NO_CURATED_EVIDENCE' });
    if (result.status === 'NO_CURATED_EVIDENCE') {
      expect(Date.parse(result.generatedAt)).not.toBeNaN();
    }
  });

  it.each(['provider failure', 'invalid model reference'])(
    'degrades to structured evidence after %s',
    async (failure) => {
      if (failure === 'provider failure') {
        generator.generate.mockRejectedValue(new Error('provider secret'));
      } else {
        generator.generate.mockResolvedValue({
          ...draft,
          groups: [
            {
              ...draft.groups[0],
              therapies: [
                {
                  ...draft.groups[0].therapies[0],
                  statements: [
                    {
                      text: 'invalid',
                      evidenceIds: ['invented-evidence'],
                      regulatoryApprovalIds: [],
                    },
                  ],
                },
              ],
            },
            draft.groups[1],
          ],
        });
      }

      const result = await answerEvidenceQuery(request, dependencies);
      expect(result).toMatchObject({
        status: 'SUMMARY_UNAVAILABLE',
        answer: null,
        resultGroups: [
          {
            scope: 'SAME_DISEASE',
            therapies: [{ associationId: 'assoc-direct' }],
          },
          { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
        ],
      });
      expect(repository.saveAnswerSnapshot).not.toHaveBeenCalled();
    }
  );

  it('emits a failed model trace after governed retries are exhausted', async () => {
    const trace = vi.fn();
    generator.generate.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      answerEvidenceQuery(request, { ...dependencies, trace })
    ).resolves.toMatchObject({ status: 'SUMMARY_UNAVAILABLE' });

    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        stepKey: 'compose_evidence_answer',
        status: 'FAILED',
        agentVersion: 'answer-composition-agent@1.0.0',
        skillVersion: 'compose_evidence_answer@1.0.0',
        attempt: 2,
        errorCode: 'SKILL_EXECUTION_FAILED',
        outputHash: null,
      })
    );
  });

  it('returns a validated answer when snapshot persistence fails', async () => {
    repository.saveAnswerSnapshot.mockRejectedValue(new Error('database'));
    expect(await answerEvidenceQuery(request, dependencies)).toMatchObject({
      status: 'ANSWERED',
      cached: false,
    });
    expect(logError).toHaveBeenCalledWith(
      'Failed to save evidence answer snapshot',
      expect.any(Error)
    );
  });
});
