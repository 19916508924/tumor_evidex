import { describe, expect, it } from 'vitest';

import {
  interpretEvidenceQuestion,
  type QuestionEntityCatalog,
} from '@/shared/services/evidence-platform/natural-language-question';

const catalog: QuestionEntityCatalog = {
  diseases: [
    {
      canonicalName: 'NSCLC',
      displayNameZh: '非小细胞肺癌',
      displayNameEn: 'Non-small cell lung cancer',
      aliases: ['non-small-cell lung cancer'],
    },
    {
      canonicalName: 'CRC',
      displayNameZh: '结直肠癌',
      displayNameEn: 'Colorectal cancer',
      aliases: ['colorectal carcinoma'],
    },
  ],
  genes: [
    {
      id: 'gene-egfr',
      symbol: 'EGFR',
      name: 'epidermal growth factor receptor',
      aliases: [],
    },
    {
      id: 'gene-kras',
      symbol: 'KRAS',
      name: 'KRAS proto-oncogene',
      aliases: [],
    },
    {
      id: 'gene-alk',
      symbol: 'ALK',
      name: 'ALK receptor tyrosine kinase',
      aliases: [],
    },
  ],
  variants: [
    {
      geneId: 'gene-egfr',
      alterationType: 'SNV',
      hgvsp: 'p.L858R',
      canonicalKey: 'EGFR:L858R',
      aliases: ['exon 21 L858R', 'p.Leu858Arg'],
    },
    {
      geneId: 'gene-egfr',
      alterationType: 'SNV',
      hgvsp: 'p.T790M',
      canonicalKey: 'EGFR:T790M',
      aliases: ['T790M'],
    },
    {
      geneId: 'gene-egfr',
      alterationType: 'DEL',
      hgvsp: 'p.E746_A750del',
      canonicalKey: 'EGFR:E746_A750del',
      aliases: ['exon19del', 'exon 19 del', '19号外显子缺失'],
    },
    {
      geneId: 'gene-kras',
      alterationType: 'SNV',
      hgvsp: 'p.G12C',
      canonicalKey: 'KRAS:G12C',
      aliases: ['G12C'],
    },
    {
      geneId: 'gene-kras',
      alterationType: 'SNV',
      hgvsp: 'p.G12D',
      canonicalKey: 'KRAS:G12D',
      aliases: ['G12D'],
    },
    {
      geneId: 'gene-alk',
      alterationType: 'FUSION',
      hgvsp: null,
      canonicalKey: 'ALK:FUSION',
      aliases: ['ALK fusion', 'ALK 融合'],
    },
  ],
  drugs: [
    {
      genericName: 'osimertinib',
      displayNameZh: '奥希替尼',
      displayNameEn: 'Osimertinib',
      brandNames: [],
      aliases: [],
    },
    {
      genericName: 'afatinib',
      displayNameZh: '阿法替尼',
      displayNameEn: 'Afatinib',
      brandNames: [],
      aliases: [],
    },
    {
      genericName: 'lorlatinib',
      displayNameZh: '洛拉替尼',
      displayNameEn: 'Lorlatinib',
      brandNames: [],
      aliases: [],
    },
  ],
};

describe('natural-language evidence question interpretation', () => {
  it('resolves an unprefixed catalog protein variant in a Chinese question', () => {
    expect(
      interpretEvidenceQuestion(
        {
          question: 'EGFR L858R 在非小细胞肺癌中有哪些已审核治疗证据？',
          locale: 'zh-CN',
        },
        catalog
      )
    ).toMatchObject({
      status: 'RESOLVED',
      query: {
        disease: 'NSCLC',
        biomarkers: [{ gene: 'EGFR', alterationType: 'SNV', hgvsp: 'p.L858R' }],
      },
      normalizedQuery: {
        disease: 'NSCLC',
        gene: 'EGFR',
        hgvsp: 'p.L858R',
        canonicalVariantKey: 'EGFR:L858R',
      },
    });
  });

  it('resolves supported entities without inventing clinical context', () => {
    expect(
      interpretEvidenceQuestion(
        {
          question: 'NSCLC 携带 EGFR L858R，是否有奥希替尼相关治疗证据？',
          locale: 'zh-CN',
        },
        catalog
      )
    ).toEqual({
      status: 'RESOLVED',
      intent: 'EVIDENCE_QA',
      redactedQuestion: 'NSCLC 携带 EGFR L858R，是否有奥希替尼相关治疗证据？',
      query: {
        disease: 'NSCLC',
        biomarkers: [{ gene: 'EGFR', alterationType: 'SNV', hgvsp: 'p.L858R' }],
        jurisdiction: 'US',
        locale: 'zh-CN',
      },
      normalizedQuery: {
        disease: 'NSCLC',
        gene: 'EGFR',
        alterationType: 'SNV',
        hgvsp: 'p.L858R',
        canonicalVariantKey: 'EGFR:L858R',
        jurisdiction: 'US',
        locale: 'zh-CN',
      },
      drugs: ['osimertinib'],
    });
  });

  it('uses structured context and redacts obvious identifiers', () => {
    const result = interpretEvidenceQuestion(
      {
        question:
          '患者邮箱 alice@example.com，手机 13800138000，请查询相关证据。',
        locale: 'zh-CN',
        context: {
          disease: '结直肠癌',
          gene: 'KRAS',
          variant: 'G12D',
        },
      },
      catalog
    );

    expect(result).toMatchObject({
      status: 'RESOLVED',
      query: {
        disease: 'CRC',
        biomarkers: [{ gene: 'KRAS', hgvsp: 'p.G12D' }],
      },
    });
    expect(result.redactedQuestion).not.toContain('alice@example.com');
    expect(result.redactedQuestion).not.toContain('13800138000');
  });

  it('asks only for missing disease instead of calling downstream retrieval', () => {
    expect(
      interpretEvidenceQuestion(
        {
          question: 'EGFR p.L858R 有哪些治疗证据？',
          locale: 'zh-CN',
        },
        catalog
      )
    ).toMatchObject({
      status: 'NEEDS_CLARIFICATION',
      missingFields: ['disease'],
    });
  });

  it.each([
    ['奥希替尼应该使用多少剂量？', 'DOSAGE_OR_REGIMEN'],
    ['对这个患者最好的治疗方案是什么？', 'PERSONAL_TREATMENT_RECOMMENDATION'],
  ] as const)('rejects out-of-scope request: %s', (question, reason) => {
    expect(
      interpretEvidenceQuestion({ question, locale: 'zh-CN' }, catalog)
    ).toMatchObject({ status: 'OUT_OF_SCOPE', reason });
  });

  it('does not guess unknown variants', () => {
    expect(
      interpretEvidenceQuestion(
        {
          question: 'NSCLC 的 EGFR p.C797S 有哪些治疗证据？',
          locale: 'zh-CN',
        },
        catalog
      )
    ).toMatchObject({
      status: 'NEEDS_CLARIFICATION',
      missingFields: ['variant'],
    });
  });

  it('resolves both named therapies for a comparison intent', () => {
    expect(
      interpretEvidenceQuestion(
        {
          question: 'NSCLC EGFR p.L858R 中奥希替尼和阿法替尼的证据有什么区别？',
          locale: 'zh-CN',
        },
        catalog
      )
    ).toMatchObject({
      status: 'RESOLVED',
      intent: 'THERAPY_COMPARISON',
      drugs: ['osimertinib', 'afatinib'],
    });
  });

  it('resolves entities added to the locked release catalog without code changes', () => {
    expect(
      interpretEvidenceQuestion(
        {
          question: 'NSCLC 的 ALK 融合是否有洛拉替尼证据？',
          locale: 'zh-CN',
        },
        catalog
      )
    ).toMatchObject({
      status: 'RESOLVED',
      query: {
        disease: 'NSCLC',
        biomarkers: [
          { gene: 'ALK', alterationType: 'FUSION', hgvsp: 'ALK:FUSION' },
        ],
      },
      drugs: ['lorlatinib'],
    });
  });
});
