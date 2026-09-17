import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EvidenceExplorer } from '@/shared/components/evidence/evidence-explorer';

const answeredData = {
  status: 'ANSWERED',
  normalizedInput: {
    disease: 'NSCLC',
    gene: 'EGFR',
    alterationType: 'SNV',
    hgvsp: 'p.L858R',
    canonicalVariantKey: 'EGFR|SNV|p.L858R',
    jurisdiction: 'US',
    locale: 'zh-CN',
  },
  knowledge: {
    release: 'v0.1.0',
    literatureCutoffAt: '2026-09-01',
    regulatoryCutoffAt: '2026-09-01',
    gradingRuleVersion: 'evidex-v1',
    promptVersion: 'evidex-answer-v1',
  },
  resultGroups: [
    {
      scope: 'SAME_DISEASE',
      therapies: [
        {
          associationId: 'assoc_nsclc_egfr_l858r_osimertinib',
          sourceDisease: {
            id: 'disease-nsclc',
            canonicalName: 'NSCLC',
            displayNameZh: '非小细胞肺癌',
            displayNameEn: 'Non-small cell lung cancer',
            lineage: 'SOLID',
          },
          variant: {
            id: 'variant-egfr-l858r',
            gene: 'EGFR',
            alterationType: 'SNV',
            hgvsp: 'p.L858R',
            canonicalKey: 'EGFR|SNV|p.L858R',
            applicability: 'EXACT',
          },
          drugs: [
            {
              id: 'drug-osimertinib',
              genericName: 'osimertinib',
              displayNameZh: '奥希替尼',
              displayNameEn: 'Osimertinib',
              role: 'PRIMARY',
              sortOrder: 0,
            },
          ],
          direction: 'SENSITIVITY',
          approvedLevel: '1',
          sourceApprovedLevel: '1',
          gradingRationale: '同疾病、精确变异且 FDA 标签匹配。',
          regulatoryAlignment: 'MATCHED_INDICATION',
          regulatoryApprovals: [
            {
              id: 'approval_fda_nda208065_orig1_osimertinib',
              authority: 'FDA',
              applicationNumber: 'NDA 208065',
              approvalStatus: 'APPROVED',
              approvalDate: '2015-11-13',
              statusAsOf: '2026-09-01',
              indicationText:
                'First-line treatment of adult patients with metastatic NSCLC whose tumors have EGFR exon 19 deletions or exon 21 L858R mutations, as detected by an FDA-approved test.',
              biomarkerText: 'EGFR exon 19 deletion or exon 21 L858R mutation',
              source: {
                id: 'source-fda-osimertinib',
                sourceType: 'FDA',
                externalId: 'NDA 208065',
                title: 'FDA approval record',
                url: 'https://www.accessdata.fda.gov/example',
              },
            },
          ],
          evidenceClaims: [
            {
              id: 'claim_flaura_29151359_pfs',
              claimType: 'EFFICACY',
              evidenceMaturity: 'MATURE_CLINICAL',
              studyType: 'Randomized, double-blind, phase 3 trial',
              studyName: 'FLAURA',
              populationSummary:
                '556 previously untreated patients with advanced NSCLC harboring EGFR exon 19 deletion or L858R.',
              sampleSize: 556,
              diseaseStage: 'Locally advanced or metastatic',
              treatmentLine: 'First line',
              priorTherapy: 'No prior systemic therapy for advanced disease',
              intervention: 'osimertinib 80 mg once daily',
              comparator:
                'gefitinib 250 mg once daily or erlotinib 150 mg once daily',
              endpoint: 'Investigator-assessed progression-free survival',
              effectValue: {
                medianMonthsIntervention: 18.9,
                medianMonthsComparator: 10.2,
                hazardRatio: 0.46,
                confidenceInterval95: [0.37, 0.57],
                pValue: '<0.001',
              },
              conclusion:
                'Osimertinib prolonged progression-free survival versus first-generation EGFR TKIs in the combined exon 19 deletion/L858R population.',
              limitations:
                'The abstract reports the primary result for the combined exon 19 deletion/L858R population, not an independent L858R effect estimate.',
              passages: [
                {
                  id: 'passage-osimertinib',
                  source: {
                    id: 'source-pubmed-osimertinib',
                    sourceType: 'PUBMED',
                    externalId: '29151359',
                    title:
                      'Osimertinib in Untreated EGFR-Mutated Advanced NSCLC',
                    url: 'https://pubmed.ncbi.nlm.nih.gov/29151359/',
                  },
                  section: 'Abstract - Results',
                  paragraphIndex: 1,
                  locator: {},
                  displayPolicy: 'EXCERPT',
                  supportRole: 'PRIMARY',
                  text: 'Original abstract excerpt remains in English.',
                },
              ],
            },
          ],
        },
      ],
    },
    { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
  ],
  answer: {
    overallSummary: '当前已发布知识中包含多项与 EGFR p.L858R 相关的治疗证据。',
    groups: [
      {
        scope: 'SAME_DISEASE',
        therapies: [
          {
            associationId: 'assoc_nsclc_egfr_l858r_osimertinib',
            overview: '奥希替尼具有同疾病精确变异的临床与监管证据。',
            statements: [
              {
                text: 'MARIPOSA 研究中的 FDA、NSCLC 与 PFS 结果支持该关联。',
                evidenceIds: ['claim_flaura_29151359_pfs'],
                regulatoryApprovalIds: [
                  'approval_fda_nda208065_orig1_osimertinib',
                ],
              },
            ],
            limitations: ['需结合患者完整临床信息解读。'],
          },
        ],
      },
    ],
    overallLimitations: ['当前知识版本不是 PubMed 全量收录。'],
  },
  generatedAt: '2026-09-10T08:30:00.000Z',
  cached: false,
  disclaimer: '仅用于肿瘤知识学习与研究，不构成医疗建议、诊断或治疗决策。',
  disclaimerEn:
    'For oncology education and research only. Not medical advice, diagnosis, or a treatment decision.',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EvidenceExplorer', () => {
  it('submits the documented structured query and renders the traceable answer', async () => {
    const user = userEvent.setup();
    let resolveRequest: ((response: Response) => void) | undefined;
    const request = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(request);
    vi.stubGlobal('fetch', fetchMock);

    render(<EvidenceExplorer />);

    expect(
      screen.getByRole('heading', {
        name: '探索与基因变异相关的治疗证据',
      })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('癌种')).toBeEnabled();
    expect(screen.getByDisplayValue('EGFR')).toBeDisabled();
    expect(screen.getByLabelText('蛋白变异')).toBeEnabled();
    expect(screen.getByRole('heading', { name: '选择查询条件' })).toBeVisible();
    expect(
      screen.getByText('资料来源覆盖 PubMed 文献与美国药监局公开记录')
    ).toBeVisible();
    expect(
      screen.queryByText(/V0\.2|体验版|后端|知识版本|接口：/i)
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(
      screen.getByRole('button', { name: '正在整理相关证据…' })
    ).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/evidence-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        disease: 'NSCLC',
        biomarkers: [{ gene: 'EGFR', alterationType: 'SNV', hgvsp: 'p.L858R' }],
        jurisdiction: 'US',
        locale: 'zh-CN',
      }),
    });

    resolveRequest?.(
      new Response(
        JSON.stringify({ code: 0, message: 'ok', data: answeredData }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    expect(
      await screen.findByText(
        '当前收录资料中包含多项与 EGFR p.L858R 相关的治疗证据。'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /奥希替尼/ })).toBeVisible();
    expect(
      screen.getByText(
        'MARIPOSA 研究中的美国药监局、非小细胞肺癌与无进展生存期结果支持该关联。'
      )
    ).toBeVisible();
    expect(screen.queryByText(/MARIP总生存期A/)).not.toBeInTheDocument();
    expect(screen.getByText('证据等级 1')).toBeVisible();
    expect(
      screen.getByText('随机、双盲、Ⅲ期临床试验 · FLAURA · n=556')
    ).toBeVisible();
    expect(
      screen.getByText(
        '556 名既往未接受治疗、携带 EGFR 外显子 19 缺失或 L858R 变异的晚期非小细胞肺癌患者。'
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        /\u5e72\u9884\u7ec4\u4e2d\u4f4d\u6570\uff08\u6708\uff09\uff1a18\.9/
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        '用于一线治疗经美国药监局批准检测确认为 EGFR 外显子 19 缺失或外显子 21 L858R 变异的成人转移性非小细胞肺癌患者。'
      )
    ).toBeVisible();
    expect(
      screen.getByText(/Original abstract excerpt remains in English\./)
    ).toBeVisible();
    expect(screen.getByText('摘要 · 结果 · 第 1 段')).toBeVisible();
    expect(screen.getByText('PMID 29151359')).toBeVisible();
    expect(screen.getByRole('link', { name: '查看文献原文' })).toHaveAttribute(
      'href',
      'https://pubmed.ncbi.nlm.nih.gov/29151359/'
    );
    expect(
      screen.getByRole('link', { name: '查看美国药监局记录' })
    ).toHaveAttribute('href', 'https://www.accessdata.fda.gov/example');
    expect(screen.getByText('资料更新至')).toBeVisible();
    expect(screen.getByText('2026年9月1日')).toBeVisible();
    expect(screen.getByText(answeredData.disclaimer)).toBeVisible();
    expect(
      screen.queryByText(answeredData.disclaimerEn)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Treatment evidence brief')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Evidence group')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/V0\.2|体验版|后端|知识版本|接口：/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('claim_flaura_29151359_pfs')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('approval_fda_nda208065_orig1_osimertinib')
    ).not.toBeInTheDocument();
  }, 10_000);

  it('lets the user select a colorectal KRAS variant and submits its canonical structured query', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, message: 'ok', data: answeredData }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<EvidenceExplorer />);

    await user.selectOptions(screen.getByLabelText('癌种'), 'CRC');
    await user.selectOptions(
      screen.getByLabelText('蛋白变异'),
      'KRAS|SNV|p.G12D'
    );

    expect(screen.getByDisplayValue('KRAS')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/evidence-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        disease: 'CRC',
        biomarkers: [{ gene: 'KRAS', alterationType: 'SNV', hgvsp: 'p.G12D' }],
        jurisdiction: 'US',
        locale: 'zh-CN',
      }),
    });
  });

  it('keeps structured evidence visible when the generated summary is unavailable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              ...answeredData,
              status: 'SUMMARY_UNAVAILABLE',
              answer: null,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    render(<EvidenceExplorer />);
    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(await screen.findByText('综述暂时无法呈现')).toBeVisible();
    expect(screen.getByRole('heading', { name: /奥希替尼/ })).toBeVisible();
    expect(screen.getByRole('link', { name: '查看文献原文' })).toBeVisible();
  });

  it('uses Chinese fallbacks for untranslated structured fields without changing source excerpts', async () => {
    const user = userEvent.setup();
    const therapy = answeredData.resultGroups[0].therapies[0];
    const approval = therapy.regulatoryApprovals[0];
    const claim = therapy.evidenceClaims[0];
    const passage = claim.passages[0];
    const untranslatedData = {
      ...answeredData,
      disclaimer: 'English disclaimer',
      resultGroups: [
        {
          scope: 'SAME_DISEASE',
          therapies: [
            {
              ...therapy,
              associationId: 'unknown-association',
              gradingRationale: 'English grading rationale',
              drugs: [
                {
                  ...therapy.drugs[0],
                  displayNameZh: '',
                  displayNameEn: 'English drug name',
                },
              ],
              regulatoryApprovals: [
                {
                  ...approval,
                  id: 'unknown-approval',
                  indicationText: 'English indication',
                  biomarkerText: 'English biomarker',
                },
                {
                  ...approval,
                  id: 'unknown-approval-without-biomarker',
                  applicationNumber: 'NDA000002',
                  biomarkerText: null,
                },
              ],
              evidenceClaims: [
                {
                  ...claim,
                  id: 'unknown-claim',
                  studyType: 'English study type',
                  studyName: 'STUDY NAME',
                  populationSummary: 'English population',
                  diseaseStage: null,
                  treatmentLine: null,
                  priorTherapy: null,
                  intervention: 'English intervention',
                  comparator: null,
                  endpoint: 'English endpoint',
                  effectValue: {
                    unknownMetric: 1,
                    nestedMetric: { intervention: 2, comparator: 1 },
                  },
                  conclusion: 'English conclusion',
                  limitations: 'English limitations',
                  passages: [
                    {
                      ...passage,
                      id: 'unknown-section-passage',
                      section: 'Abstract - Discussion',
                      paragraphIndex: null,
                    },
                    {
                      ...passage,
                      id: 'no-section-passage',
                      section: null,
                      paragraphIndex: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
      ],
      answer: {
        overallSummary: 'English overall summary',
        groups: [
          {
            scope: 'SAME_DISEASE',
            therapies: [
              {
                associationId: 'unknown-association',
                overview: 'English overview',
                statements: [
                  {
                    text: 'English statement',
                    evidenceIds: ['unknown-claim'],
                    regulatoryApprovalIds: ['unknown-approval'],
                  },
                ],
                limitations: [],
              },
            ],
          },
        ],
        overallLimitations: ['English overall limitation'],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ code: 0, message: 'ok', data: untranslatedData }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
    );

    render(<EvidenceExplorer />);
    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(
      await screen.findByText('该治疗关联的证据分级依据暂缺中文释义。')
    ).toBeVisible();
    expect(
      screen.getByText('研究类型暂缺中文释义 · STUDY NAME · n=556')
    ).toBeVisible();
    expect(screen.getByText('干预方案暂缺中文释义（单臂）')).toBeVisible();
    expect(screen.getByText(/结果指标：1/)).toBeVisible();
    expect(screen.getByText('文献定位')).toBeVisible();
    expect(screen.getByText('来源页面')).toBeVisible();
    expect(screen.getAllByText('该监管适应证暂缺中文释义。')).toHaveLength(2);
    expect(screen.getByText(/该生物标志物范围暂缺中文释义。/)).toBeVisible();
    expect(
      screen.getAllByText(/Original abstract excerpt remains in English\./)
    ).toHaveLength(2);
    expect(
      screen.queryByText('English overall summary')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('English disclaimer')).not.toBeInTheDocument();
  });

  it('explains out-of-scope results without inventing evidence', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            data: { status: 'OUT_OF_SCOPE', field: 'hgvsp' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    render(<EvidenceExplorer />);
    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(
      await screen.findByText(/暂未收录这个基因与变异类型组合/)
    ).toBeVisible();
    expect(screen.queryByText('Level 1')).not.toBeInTheDocument();
  });

  it('shows a retryable message when the API fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: -1,
            message: 'KNOWLEDGE_RELEASE_UNAVAILABLE',
          }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    render(<EvidenceExplorer />);
    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(
      await screen.findByText('暂时无法获取证据，请稍后重试。')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '重新尝试' })).toBeEnabled();
  });

  it.each([
    ['INVALID_INPUT', '输入格式未通过校验，请检查后重试。'],
    ['PAYLOAD_TOO_LARGE', '提交内容过长，请精简后重试。'],
  ])('localizes the %s request error', async (message, expected) => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: -1, message }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    render(<EvidenceExplorer />);
    await user.click(screen.getByRole('button', { name: '查看治疗证据' }));

    expect(await screen.findByText(expected)).toBeVisible();
  });
});
