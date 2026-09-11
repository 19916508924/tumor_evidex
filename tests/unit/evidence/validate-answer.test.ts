import { describe, expect, it } from 'vitest';

import { validateEvidenceAnswer } from '@/shared/services/evidence/validate-answer';
import type {
  EvidenceAnswerDraft,
  EvidencePack,
} from '@/shared/types/evidence';

const pack = {
  normalizedQuery: {
    disease: 'NSCLC',
    gene: 'EGFR',
    alterationType: 'SNV',
    hgvsp: 'p.L858R',
    canonicalVariantKey: 'EGFR|SNV|p.L858R',
    jurisdiction: 'US',
    locale: 'zh-CN',
  },
  knowledge: {
    id: 'release-1',
    version: 'v0.1.0',
    literatureCutoffAt: '2026-09-01T00:00:00.000Z',
    regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
    gradingRuleVersion: 'evidex-therapeutic-v1',
  },
  groups: [
    {
      scope: 'SAME_DISEASE',
      therapies: [
        {
          associationId: 'assoc-direct',
          drugs: [{ id: 'drug-1' }],
          evidenceClaims: [{ id: 'evidence-direct', passages: [] }],
          regulatoryApprovals: [{ id: 'approval-direct' }],
        },
      ],
    },
    {
      scope: 'CROSS_INDICATION_EXACT_VARIANT',
      therapies: [
        {
          associationId: 'assoc-cross',
          drugs: [{ id: 'drug-2' }],
          evidenceClaims: [{ id: 'evidence-cross', passages: [] }],
          regulatoryApprovals: [{ id: 'approval-cross' }],
        },
      ],
    },
  ],
} as unknown as EvidencePack;

const validDraft: EvidenceAnswerDraft = {
  overallSummary: '基于当前发布版本的证据综述。',
  groups: [
    {
      scope: 'SAME_DISEASE',
      therapies: [
        {
          associationId: 'assoc-direct',
          overview: '同疾病证据。',
          statements: [
            {
              text: '研究报告了相关疗效结局。',
              evidenceIds: ['evidence-direct'],
              regulatoryApprovalIds: ['approval-direct'],
            },
          ],
          limitations: ['未提供完整临床信息。'],
        },
      ],
    },
    {
      scope: 'CROSS_INDICATION_EXACT_VARIANT',
      therapies: [
        {
          associationId: 'assoc-cross',
          overview: '跨适应证精确变异证据。',
          statements: [
            {
              text: '该证据来自其他实体瘤。',
              evidenceIds: ['evidence-cross'],
              regulatoryApprovalIds: [],
            },
          ],
          limitations: ['不能直接外推到具体患者。'],
        },
      ],
    },
  ],
  overallLimitations: ['不构成医疗建议。'],
};

describe('validateEvidenceAnswer', () => {
  it('accepts a complete answer whose references all belong to the pack', () => {
    expect(validateEvidenceAnswer(validDraft, pack)).toEqual({
      success: true,
      data: validDraft,
    });
  });

  it.each([
    ['associationId', 'unknown-association'],
    ['evidenceIds', ['unknown-evidence']],
    ['regulatoryApprovalIds', ['unknown-approval']],
  ] as const)('rejects an out-of-pack %s', (field, value) => {
    const draft = structuredClone(validDraft);
    const therapy = draft.groups[0].therapies[0];
    if (field === 'associationId') therapy.associationId = value as string;
    else therapy.statements[0][field] = value as unknown as string[];

    expect(validateEvidenceAnswer(draft, pack)).toMatchObject({
      success: false,
    });
  });

  it('rejects an association placed in the wrong scope', () => {
    const draft = structuredClone(validDraft);
    draft.groups[0].therapies[0].associationId = 'assoc-cross';
    expect(validateEvidenceAnswer(draft, pack)).toMatchObject({
      success: false,
    });
  });

  it('accepts a pure regulatory statement with an approval reference', () => {
    const draft = structuredClone(validDraft);
    draft.groups[0].therapies[0].statements[0].evidenceIds = [];
    expect(validateEvidenceAnswer(draft, pack)).toEqual({
      success: true,
      data: draft,
    });
  });

  it('rejects statements with no evidence or regulatory references', () => {
    const draft = structuredClone(validDraft);
    draft.groups[0].therapies[0].statements[0].evidenceIds = [];
    draft.groups[0].therapies[0].statements[0].regulatoryApprovalIds = [];
    expect(validateEvidenceAnswer(draft, pack)).toMatchObject({
      success: false,
    });
  });

  it('rejects omitted or duplicate associations', () => {
    const omitted = structuredClone(validDraft);
    omitted.groups[1].therapies = [];
    expect(validateEvidenceAnswer(omitted, pack)).toMatchObject({
      success: false,
    });

    const duplicated = structuredClone(validDraft);
    duplicated.groups[0].therapies.push(
      structuredClone(duplicated.groups[0].therapies[0])
    );
    expect(validateEvidenceAnswer(duplicated, pack)).toMatchObject({
      success: false,
    });
  });

  it('rejects duplicate groups and reports the missing scope', () => {
    const draft = structuredClone(validDraft);
    draft.groups[1] = {
      scope: 'SAME_DISEASE',
      therapies: [],
    };
    const result = validateEvidenceAnswer(draft, pack);
    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          'Duplicate answer group: SAME_DISEASE',
          'Missing answer group: CROSS_INDICATION_EXACT_VARIANT',
        ])
      );
    }
  });

  it('rejects additional model-authored drug or fact fields', () => {
    const draft = structuredClone(validDraft) as EvidenceAnswerDraft & {
      drugName?: string;
    };
    draft.groups[0].therapies[0] = {
      ...draft.groups[0].therapies[0],
      drugName: 'invented drug',
    } as never;
    expect(validateEvidenceAnswer(draft, pack)).toMatchObject({
      success: false,
    });
  });

  it('rejects output beyond the configured serialized length', () => {
    const draft = structuredClone(validDraft);
    draft.overallSummary = '证'.repeat(200);
    expect(
      validateEvidenceAnswer(draft, pack, { maxSerializedLength: 100 })
    ).toMatchObject({ success: false });
  });

  it('rejects values that cannot be serialized as JSON', () => {
    expect(validateEvidenceAnswer({ value: BigInt(1) }, pack)).toMatchObject({
      success: false,
    });
  });
});
