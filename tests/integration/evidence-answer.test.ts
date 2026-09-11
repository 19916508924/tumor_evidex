import { POST } from '@/app/api/v1/evidence-answer/route';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EvidenceAnswerDependencies } from '@/shared/services/evidence/answer-evidence-query';
import type {
  EvidenceAnswerDraft,
  EvidenceResultGroup,
  KnowledgeReleaseInfo,
} from '@/shared/types/evidence';

const { getEvidenceAnswerDependencies } = vi.hoisted(() => ({
  getEvidenceAnswerDependencies: vi.fn(),
}));

vi.mock('@/shared/services/evidence/runtime', () => ({
  getEvidenceAnswerDependencies,
}));

const validRequest = {
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
const dependencies: EvidenceAnswerDependencies = {
  repository,
  generator,
  promptVersion: 'evidex-answer-v1',
  provider: 'openrouter',
  model: 'test-model',
  now: () => new Date('2026-09-09T08:00:00.000Z'),
  logError: vi.fn(),
};

function request(body: string | object) {
  return new Request('http://localhost/api/v1/evidence-answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/v1/evidence-answer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEvidenceAnswerDependencies.mockReturnValue(dependencies);
    repository.getPublishedRelease.mockResolvedValue(release);
    repository.retrieveEvidence.mockResolvedValue(resultGroups);
    repository.findAnswerSnapshot.mockResolvedValue(null);
    repository.saveAnswerSnapshot.mockResolvedValue(undefined);
    generator.generate.mockResolvedValue(draft);
  });

  it('returns an ANSWERED domain result as HTTP 200', async () => {
    const response = await POST(request(validRequest));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      message: 'ok',
      data: {
        status: 'ANSWERED',
        knowledge: { release: 'v0.1.0' },
        resultGroups: [
          {
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
      },
    });
  });

  it('returns malformed input as HTTP 400 and does not touch dependencies', async () => {
    const response = await POST(request({ disease: 'NSCLC' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: -1,
      message: 'INVALID_INPUT',
    });
    expect(repository.getPublishedRelease).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('returns invalid JSON as HTTP 400', async () => {
    const response = await POST(request('{'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'INVALID_INPUT',
    });
  });

  it('returns a valid out-of-scope query as HTTP 200 without model work', async () => {
    const response = await POST(
      request({ ...validRequest, disease: 'melanoma' })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { status: 'OUT_OF_SCOPE', field: 'disease' },
    });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('accepts a supported cross-entity combination and reports no curated evidence', async () => {
    repository.retrieveEvidence.mockResolvedValue([
      { scope: 'SAME_DISEASE', therapies: [] },
      { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
    ]);

    const response = await POST(request({ ...validRequest, disease: 'CRC' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      data: {
        status: 'NO_CURATED_EVIDENCE',
        normalizedInput: {
          disease: 'CRC',
          canonicalVariantKey: 'EGFR|SNV|p.L858R',
        },
      },
    });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('returns missing release or database failure as HTTP 500', async () => {
    repository.getPublishedRelease.mockResolvedValue(null);
    const response = await POST(request(validRequest));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'KNOWLEDGE_RELEASE_UNAVAILABLE',
    });
  });

  it('does not expose runtime initialization failures', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    getEvidenceAnswerDependencies.mockImplementation(() => {
      throw new Error('database connection string');
    });
    const response = await POST(request(validRequest));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'KNOWLEDGE_RELEASE_UNAVAILABLE',
    });
    expect(errorLog).toHaveBeenCalled();
  });

  it('returns model failure as HTTP 200 with structured evidence', async () => {
    generator.generate.mockRejectedValue(new Error('provider failed'));
    const response = await POST(request(validRequest));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: 0,
      data: {
        status: 'SUMMARY_UNAVAILABLE',
        answer: null,
        resultGroups: [
          { therapies: [{ associationId: 'assoc-direct' }] },
          { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
        ],
      },
    });
  });

  it('rejects request bodies larger than the endpoint limit', async () => {
    const response = await POST(
      request({ ...validRequest, padding: 'x'.repeat(70_000) })
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      code: -1,
      message: 'PAYLOAD_TOO_LARGE',
    });
    expect(getEvidenceAnswerDependencies).not.toHaveBeenCalled();
  });
});
