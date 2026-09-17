import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AskWorkbench } from '@/shared/components/evidence-platform/ask-workbench';
import { KnowledgeEvidenceDetail } from '@/shared/components/evidence-platform/knowledge-record-details';
import {
  KnowledgeHome,
  KnowledgeList,
} from '@/shared/components/evidence-platform/knowledge-workspace';
import { CandidateIntake } from '@/shared/components/evidence-platform/ops-candidate-intake';
import { DefinitionManagementPage } from '@/shared/components/evidence-platform/ops-definition-management';
import { DiscoveryRunDetailPage } from '@/shared/components/evidence-platform/ops-discovery-run-detail';
import { NewDiscoveryRunPage } from '@/shared/components/evidence-platform/ops-discovery-workflow';
import { ReviewQueuePage } from '@/shared/components/evidence-platform/ops-review-queue';
import { ReviewWorkspace } from '@/shared/components/evidence-platform/ops-review-workspace';
import { OpsShell } from '@/shared/components/evidence-platform/ops-shell';
import {
  OpsCollectionPage,
  OpsDashboard,
} from '@/shared/components/evidence-platform/ops-workspace';
import { PublicAppShell } from '@/shared/components/evidence-platform/public-app-shell';
import type { EvidenceDraftInput } from '@/shared/services/evidence-platform/upstream-workflow';

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
}));

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: 0, message: 'ok', data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function reviewTaskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    status: 'READY_FOR_REVIEW',
    draftId: 'draft-1',
    draftVersion: 1,
    hasBlockingIssues: false,
    publishedReleaseId: null,
    currentRelease: { id: 'release-current', version: 'v0.2.0' },
    expectedNextRelease: 'v0.2.1',
    publicationPreview: {
      currentApprovedLevel: '2B',
      currentGradingRationale: '现有临床研究规模有限。',
      proposedApprovedLevel: '3A',
      proposedGradingRationale: '成熟临床研究支持该治疗关联。',
      levelChanged: true,
      newClaimCount: 2,
      modifiedClaimCount: 0,
      source: {
        sourceType: 'PUBMED',
        externalId: '12345678',
        sourceScope: 'ABSTRACT',
      },
      currentRelease: { id: 'release-current', version: 'v0.2.0' },
      expectedNextRelease: 'v0.2.1',
    },
    candidate: {
      id: 'candidate-1',
      sourceType: 'PUBMED',
      externalId: '12345678',
      title: 'Original English Literature Title',
      journal: 'Evidence Journal',
      publicationDate: '2026-08-12',
      doi: null,
      sourceScope: 'ABSTRACT',
      sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
      abstract:
        'Patients with advanced EGFR-mutated NSCLC received osimertinib. Progression-free survival improved. The study was open label.',
    },
    draft: {
      associationId: 'assoc-1',
      proposedLevel: '3A',
      gradingRationale: '成熟临床研究支持该治疗关联。',
      passages: [
        {
          id: 'passage-primary',
          text: 'Progression-free survival improved.',
          textHash: 'hash-primary',
          section: 'Abstract Results',
          paragraphIndex: 1,
          locator: { sentenceIndex: 1 },
          displayPolicy: 'EXCERPT',
          modelUsePolicy: 'ALLOWED',
          supportRole: 'PRIMARY',
        },
        {
          id: 'passage-context',
          text: 'Patients with advanced EGFR-mutated NSCLC received osimertinib.',
          textHash: 'hash-context',
          section: 'Abstract Methods',
          paragraphIndex: 0,
          displayPolicy: 'EXCERPT',
          modelUsePolicy: 'ALLOWED',
          supportRole: 'CONTEXT',
        },
        {
          id: 'passage-limit',
          text: 'The study was open label.',
          textHash: 'hash-limit',
          section: 'Abstract Discussion',
          paragraphIndex: 2,
          displayPolicy: 'EXCERPT',
          modelUsePolicy: 'ALLOWED',
          supportRole: 'LIMITATION',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          claimType: 'EFFICACY',
          evidenceMaturity: 'MATURE_CLINICAL',
          studyType: '随机对照 III 期试验',
          studyName: 'FLAURA',
          populationSummary: '晚期 EGFR 突变非小细胞肺癌人群',
          sampleSize: 556,
          diseaseStage: '晚期',
          treatmentLine: '一线',
          priorTherapy: null,
          intervention: '奥希替尼',
          comparator: '标准 EGFR-TKI',
          endpoint: '无进展生存期',
          effectValue: { hazardRatio: 0.46 },
          conclusion: '奥希替尼改善无进展生存期。',
          limitations: '开放标签设计。',
          passageIds: ['passage-primary', 'passage-context', 'passage-limit'],
        },
        {
          id: 'claim-2',
          claimType: 'SAFETY_CONTEXT',
          evidenceMaturity: 'MATURE_CLINICAL',
          studyType: '随机对照 III 期试验',
          studyName: 'FLAURA',
          populationSummary: '同一研究安全性人群',
          sampleSize: 556,
          diseaseStage: '晚期',
          treatmentLine: '一线',
          priorTherapy: null,
          intervention: '奥希替尼',
          comparator: '标准 EGFR-TKI',
          endpoint: '不良事件',
          effectValue: null,
          conclusion: '安全性结果需与疗效分开解读。',
          limitations: '摘要中安全性细节有限。',
          passageIds: ['passage-primary', 'passage-limit'],
        },
      ],
      fieldProvenance: {
        'claims.0.conclusion': ['passage-primary'],
        'claims.0.populationSummary': ['passage-context'],
        'claims.0.limitations': ['passage-limit'],
        'claims.1.conclusion': ['passage-primary'],
        'claims.1.limitations': ['passage-limit'],
      },
      qaIssues: [],
    },
    draftMetadata: {
      agentVersion: 'extraction-agent@1.0.0',
      skillVersions: ['extract@1.0.0'],
      fieldProvenance: {
        'claims.0.conclusion': ['passage-primary'],
        'claims.0.populationSummary': ['passage-context'],
        'claims.0.limitations': ['passage-limit'],
        'claims.1.conclusion': ['passage-primary'],
        'claims.1.limitations': ['passage-limit'],
      },
      editedBy: null,
      editReason: null,
    },
    history: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('Evidex public product frontend', () => {
  it('renders a Chinese public application shell without development-stage copy', () => {
    render(
      <PublicAppShell>
        <p>页面内容</p>
      </PublicAppShell>
    );

    expect(screen.getByRole('link', { name: '问证据' })).toHaveAttribute(
      'href',
      '/zh/ask'
    );
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute(
      'href',
      '/zh/knowledge'
    );
    expect(screen.getByText('页面内容')).toBeVisible();
    expect(
      screen.queryByText(/后端|接口|体验版|V0\.2|知识库版本/i)
    ).not.toBeInTheDocument();
  });

  it('loads the published knowledge overview and provides all four entity entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          release: {
            id: 'release-1',
            version: 'v1.0.0',
            literatureCutoffAt: '2026-09-01T00:00:00.000Z',
            regulatoryCutoffAt: '2026-09-02T00:00:00.000Z',
            publishedAt: '2026-09-16T00:00:00.000Z',
          },
          counts: {
            diseases: 2,
            genes: 2,
            variants: 5,
            drugs: 8,
            associations: 13,
            claims: 20,
            sources: 22,
          },
          recentReleases: [],
        })
      )
    );

    render(<KnowledgeHome locale="zh" />);

    expect(
      await screen.findByRole('heading', {
        name: '从一个问题，抵达可核验的证据',
      })
    ).toBeVisible();
    expect(await screen.findByRole('link', { name: /疾病/ })).toHaveAttribute(
      'href',
      '/zh/knowledge/diseases'
    );
    expect(screen.getByRole('link', { name: /基因/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /变异/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /药物/ })).toBeVisible();
    expect(screen.getByText('20 条已审核证据声明')).toBeVisible();
    expect(screen.getByText('文献收录截至 2026年9月1日')).toBeVisible();
  });

  it('searches an entity list and gives an honest empty state', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          release: { version: 'v1.0.0' },
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<KnowledgeList locale="zh" type="genes" />);

    await screen.findByRole('heading', { name: '基因目录' });
    await user.type(screen.getByRole('searchbox'), 'EGFR');
    await user.click(screen.getByRole('button', { name: '搜索' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/knowledge/genes?q=EGFR&page=1&pageSize=20',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(await screen.findByText('没有找到匹配的基因')).toBeVisible();
  });

  it('restores knowledge filters and pagination from the URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/zh/knowledge/variants?q=L858R&page=2&diseaseId=disease_nsclc&geneId=gene_egfr&direction=SENSITIVITY&level=1'
    );
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.includes('/diseases?')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'disease_nsclc',
                type: 'disease',
                canonicalName: 'NSCLC',
                displayNameZh: '非小细胞肺癌',
                displayNameEn: 'Non-small cell lung cancer',
                aliases: [],
              },
            ],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          })
        );
      }
      if (input.includes('/genes?')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'gene_egfr',
                type: 'gene',
                canonicalName: 'EGFR',
                displayNameZh: 'EGFR',
                displayNameEn: 'epidermal growth factor receptor',
                aliases: [],
              },
            ],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          })
        );
      }
      return Promise.resolve(
        jsonResponse({
          items: [],
          pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <KnowledgeList
        locale="zh"
        type="variants"
        initialSearchParams={{
          q: 'L858R',
          page: '2',
          diseaseId: 'disease_nsclc',
          geneId: 'gene_egfr',
          direction: 'SENSITIVITY',
          level: '1',
        }}
      />
    );

    expect(await screen.findByDisplayValue('L858R')).toBeVisible();
    expect(screen.getByLabelText('按疾病筛选')).toHaveValue('disease_nsclc');
    expect(screen.getByLabelText('按基因筛选')).toHaveValue('gene_egfr');
    expect(screen.getByLabelText('按证据方向筛选')).toHaveValue('SENSITIVITY');
    expect(screen.getByLabelText('按证据等级筛选')).toHaveValue('1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/knowledge/variants?q=L858R&diseaseId=disease_nsclc&geneId=gene_egfr&direction=SENSITIVITY&level=1&page=2&pageSize=20',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(window.location.search).toContain('page=3');
  });

  it('shows the complete public evidence record and source identifiers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          release: {
            id: 'release-1',
            version: 'v1.0.0',
            literatureCutoffAt: '2026-09-01T00:00:00.000Z',
            regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
            publishedAt: '2026-09-16T00:00:00.000Z',
          },
          claim: {
            id: 'claim-1',
            claimType: 'EFFICACY',
            evidenceMaturity: 'MATURE_CLINICAL',
            studyType: '随机双盲 III 期试验',
            studyName: 'FLAURA',
            populationSummary: '未接受晚期系统治疗的患者',
            sampleSize: 556,
            diseaseStage: '局部晚期或转移性',
            treatmentLine: '一线',
            priorTherapy: '无晚期系统治疗',
            intervention: '奥希替尼',
            comparator: '吉非替尼或厄洛替尼',
            endpoint: '无进展生存期',
            effectValue: {
              hazardRatio: 0.46,
              confidenceInterval95: [0.37, 0.57],
            },
            conclusion: '奥希替尼延长无进展生存期。',
            limitations: '结果来自合并突变人群。',
          },
          association: {
            id: 'association-1',
            approvedLevel: '1',
            direction: 'SENSITIVITY',
            disease: { id: 'disease-1', displayNameZh: '非小细胞肺癌' },
            gene: { id: 'gene-1', symbol: 'EGFR' },
            variant: { id: 'variant-1', hgvsp: 'p.L858R' },
            drugs: [{ id: 'drug-1', displayNameZh: '奥希替尼' }],
          },
          passages: [
            {
              id: 'passage-1',
              text: 'The median progression-free survival was longer.',
              source: {
                id: 'source-1',
                sourceType: 'PUBMED',
                title: 'Original English Literature Title',
                externalId: '29151359',
                doi: '10.1056/NEJMoa1713137',
              },
            },
          ],
        })
      )
    );

    render(<KnowledgeEvidenceDetail locale="zh" id="claim-1" />);

    expect(await screen.findByText('随机双盲 III 期试验')).toBeVisible();
    expect(screen.getByText('样本量')).toBeVisible();
    expect(screen.getByText('556')).toBeVisible();
    expect(screen.getByText('疾病阶段')).toBeVisible();
    expect(screen.getByText('局部晚期或转移性')).toBeVisible();
    expect(screen.getByText('治疗线次')).toBeVisible();
    expect(screen.getByText('一线')).toBeVisible();
    expect(screen.getByText('既往治疗')).toBeVisible();
    expect(screen.getByText('无晚期系统治疗')).toBeVisible();
    expect(screen.getByText('PMID：29151359')).toBeVisible();
    expect(screen.getByText('DOI：10.1056/NEJMoa1713137')).toBeVisible();
    expect(screen.getByText('非小细胞肺癌 · EGFR · p.L858R')).toBeVisible();
  });

  it('submits and polls an evidence question through every visible stage', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { questionRunId: 'question-1', status: 'PENDING', pollAfterMs: 0 },
          202
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'question-1',
          status: 'ANSWERED',
          progress: 'COMPLETED',
          question: 'EGFR L858R 有哪些已审核证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          result: {
            status: 'ANSWERED',
            answer: {
              overallSummary: '奥希替尼具有同疾病、精确变异的已审核证据。',
              overallLimitations: ['仍需结合完整临床背景理解。'],
              groups: [],
            },
            resultGroups: [],
            disclaimer: '仅用于肿瘤知识学习与研究，不构成医疗建议。',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AskWorkbench locale="zh" pollIntervalMs={0} />);
    await user.type(
      screen.getByRole('textbox', { name: '你的证据问题' }),
      'EGFR L858R 有哪些已审核证据？'
    );
    await user.click(screen.getByRole('button', { name: '查找证据' }));

    expect(await screen.findByText('理解问题')).toBeVisible();
    expect(screen.getByText('检索已审核证据')).toBeVisible();
    expect(screen.getByText('整理证据与限制')).toBeVisible();
    expect(screen.getByText('校验引用')).toBeVisible();
    expect(screen.getByRole('list', { name: '证据整理进度' })).toHaveClass(
      'self-start'
    );
    expect(
      await screen.findByText('奥希替尼具有同疾病、精确变异的已审核证据。')
    ).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/evidence-questions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          question: 'EGFR L858R 有哪些已审核证据？',
          locale: 'zh-CN',
        }),
      })
    );
  });

  it('keeps structured evidence visible when the written summary is unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            questionRunId: 'question-summary',
            status: 'PENDING',
            pollAfterMs: 0,
          },
          202
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'question-summary',
          questionRunId: 'question-summary',
          status: 'SUMMARY_UNAVAILABLE',
          progress: 'COMPLETED',
          question: 'EGFR L858R 有哪些证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          completedAt: '2026-09-16T00:00:00.000Z',
          result: {
            status: 'SUMMARY_UNAVAILABLE',
            answer: null,
            resultGroups: [
              {
                scope: 'SAME_DISEASE',
                therapies: [
                  {
                    associationId: 'association-1',
                    drugs: [
                      {
                        displayNameZh: '奥希替尼',
                        displayNameEn: 'osimertinib',
                      },
                    ],
                    approvedLevel: '1',
                    evidenceClaims: [
                      {
                        id: 'claim-1',
                        conclusion: '奥希替尼具有已审核证据。',
                        limitations: '需结合临床背景。',
                      },
                    ],
                  },
                ],
              },
            ],
            generatedAt: '2026-09-16T00:00:00.000Z',
            disclaimer: '仅用于肿瘤知识学习与研究。',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AskWorkbench locale="zh" pollIntervalMs={0} />);
    await user.type(
      screen.getByRole('textbox', { name: '你的证据问题' }),
      'EGFR L858R 有哪些证据？'
    );
    await user.click(screen.getByRole('button', { name: '查找证据' }));

    expect(
      await screen.findByRole('heading', { name: '证据已找到，摘要暂不可用' })
    ).toBeVisible();
    expect(screen.getByText('查看已审核证据声明 1')).toBeVisible();
    expect(
      screen.getByRole('link', { name: '查看已审核证据声明 1' })
    ).toHaveAttribute('href', '/zh/knowledge/evidence/claim-1');
    expect(screen.getByRole('button', { name: '重新生成摘要' })).toBeVisible();
  });

  it('retries a failed question run through the dedicated retry contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            questionRunId: 'question-failed',
            status: 'PENDING',
            pollAfterMs: 0,
          },
          202
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'question-failed',
          questionRunId: 'question-failed',
          status: 'FAILED',
          progress: 'COMPLETED',
          question: 'EGFR L858R 有哪些证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          result: { status: 'FAILED', message: '生成未完成' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            questionRunId: 'question-retry',
            status: 'PENDING',
            pollAfterMs: 0,
            idempotent: false,
          },
          202
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'question-retry',
          questionRunId: 'question-retry',
          status: 'ANSWERED',
          progress: 'COMPLETED',
          question: 'EGFR L858R 有哪些证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          result: {
            status: 'ANSWERED',
            answer: { overallSummary: '重试后的已审核回答。', groups: [] },
            resultGroups: [],
            disclaimer: '仅用于肿瘤知识学习与研究。',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AskWorkbench locale="zh" pollIntervalMs={0} />);
    await user.type(
      screen.getByRole('textbox', { name: '你的证据问题' }),
      'EGFR L858R 有哪些证据？'
    );
    await user.click(screen.getByRole('button', { name: '查找证据' }));
    await user.click(
      await screen.findByRole('button', { name: '重新整理回答' })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/evidence-questions/question-failed/retry',
      expect.objectContaining({ method: 'POST' })
    );
    expect(await screen.findByText('重试后的已审核回答。')).toBeVisible();
    expect(window.location.search).toBe('?run=question-retry');
  });

  it('lets the user stop waiting without cancelling the saved question run', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            questionRunId: 'question-running',
            status: 'PENDING',
            pollAfterMs: 0,
          },
          202
        )
      )
      .mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AskWorkbench locale="zh" pollIntervalMs={0} />);
    await user.type(
      screen.getByRole('textbox', { name: '你的证据问题' }),
      'EGFR L858R 有哪些证据？'
    );
    await user.click(screen.getByRole('button', { name: '查找证据' }));
    await user.click(await screen.findByRole('button', { name: '停止等待' }));

    expect(screen.getByText('已暂停等待')).toBeVisible();
    expect(screen.getByRole('button', { name: '继续等待' })).toBeVisible();
    expect(window.location.search).toBe('?run=question-running');
    expect(window.localStorage.getItem('evidex.questionRunId')).toBe(
      'question-running'
    );
  });

  it('backs off polling and explains when a saved question run is still queued', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-09-17T00:00:00.000Z').getTime();
    vi.setSystemTime(startedAt);
    const pollTimes: number[] = [];
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return jsonResponse(
            {
              questionRunId: 'question-stalled',
              status: 'PENDING',
              pollAfterMs: 1000,
            },
            202
          );
        }
        pollTimes.push(Date.now());
        return jsonResponse({
          id: 'question-stalled',
          questionRunId: 'question-stalled',
          status: 'PENDING',
          progress: 'UNDERSTANDING_QUESTION',
          pollAfterMs: 1000,
          question: 'EGFR L858R 有哪些证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          result: null,
          createdAt: '2026-09-17T00:00:00.000Z',
          completedAt: null,
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<AskWorkbench locale="zh" />);
    fireEvent.change(screen.getByRole('textbox', { name: '你的证据问题' }), {
      target: { value: 'EGFR L858R 有哪些证据？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '查找证据' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(27_000);
    });

    expect(screen.getByRole('heading', { name: '任务仍在排队' })).toBeVisible();
    expect(screen.getByText(/后台处理可能暂时不可用/)).toBeVisible();
    expect(screen.getByRole('button', { name: '重新检查' })).toBeVisible();
    expect(screen.getByRole('button', { name: '停止等待' })).toBeVisible();
    expect(pollTimes.map((time) => time - startedAt)).toEqual([
      1000, 3000, 7000, 15_000, 25_000,
    ]);
    expect(window.location.search).toBe('?run=question-stalled');
    expect(window.localStorage.getItem('evidex.questionRunId')).toBe(
      'question-stalled'
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('restores a question run from the URL and offers complete feedback categories', async () => {
    window.history.replaceState({}, '', '/zh/ask?run=question-restored');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'question-restored',
          questionRunId: 'question-restored',
          status: 'ANSWERED',
          progress: 'COMPLETED',
          question: 'EGFR L858R 有哪些证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          completedAt: '2026-09-16T00:00:00.000Z',
          result: {
            status: 'ANSWERED',
            answer: { overallSummary: '恢复后的回答。', groups: [] },
            resultGroups: [],
            generatedAt: '2026-09-16T00:00:00.000Z',
            disclaimer: '仅用于肿瘤知识学习与研究。',
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'feedback-1', category: 'IRRELEVANT_CITATION' })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AskWorkbench locale="zh" pollIntervalMs={0} />);

    expect(await screen.findByText('恢复后的回答。')).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/evidence-questions/question-restored',
      undefined
    );
    await user.click(screen.getByRole('radio', { name: '引用不相关' }));
    await user.type(
      screen.getByLabelText('补充说明'),
      '第二条引用与结论不匹配'
    );
    await user.click(screen.getByRole('button', { name: '提交反馈' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/evidence-questions/question-restored/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          category: 'IRRELEVANT_CITATION',
          comment: '第二条引用与结论不匹配',
        }),
      })
    );
  });
});

describe('Evidex operations frontend', () => {
  it('renders dashboard metrics and switches the reporting range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        range: '7d',
        counts: {
          discovered: 18,
          duplicate: 2,
          excluded: 1,
          processing: 3,
          readyForReview: 4,
          published: 8,
          failed: 0,
        },
        backlog: { reviewTasks: 4, oldestWaitingSince: null },
        workflow: {
          total: 18,
          failed: 0,
          needsHuman: 1,
          retries: 2,
          failureRate: 0,
        },
        latestDiscoveryRun: null,
        latestRelease: null,
        alerts: [],
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<OpsDashboard locale="zh" />);

    expect(
      await screen.findByRole('heading', { name: '证据运营总览' })
    ).toBeVisible();
    expect(screen.getByText('18')).toBeVisible();
    expect(screen.getByText('4 项待审核')).toBeVisible();
    expect(screen.getByText('当前没有需要立即处理的告警')).toBeVisible();
    expect(screen.getByRole('link', { name: '发起知识更新' })).toHaveAttribute(
      'href',
      '/zh/ops/discovery-runs/new'
    );

    await user.click(screen.getByRole('button', { name: '近 30 天' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/internal/v1/ops/dashboard?range=30d',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
  });

  it('previews a scoped knowledge update before creating the run', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.startsWith('/api/v1/knowledge/genes?')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'gene_egfr',
                type: 'gene',
                canonicalName: 'EGFR',
                displayNameZh: 'EGFR',
                displayNameEn: 'EGFR',
                aliases: [],
              },
            ],
            pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
          })
        );
      }
      if (input === '/api/internal/v1/discovery-runs/preview') {
        return Promise.resolve(
          jsonResponse({
            snapshot: {
              mode: 'SCOPED',
              diseaseIds: [],
              geneIds: ['gene_egfr'],
              variantIds: [],
              aliasVersion: 'aliases-1',
              knowledgeReleaseId: 'release-1',
              knowledgeReleaseVersion: 'v1.0.0',
            },
            documentLimit: 50,
            window: {
              from: '2026-06-01T00:00:00.000Z',
              to: '2026-09-01T00:00:00.000Z',
            },
            queries: [
              {
                strategyId: 'strategy-1',
                strategyVersion: '1',
                associationId: 'association-1',
                query: 'EGFR[Title/Abstract]',
                label: 'EGFR',
                estimatedMatchCount: 23,
              },
            ],
            estimatedMatchCount: 23,
            warnings: ['预估结果可能包含重复文献。'],
            previewHash: 'preview-hash',
            expiresAt: '2099-09-16T00:15:00.000Z',
            previewToken: 'preview-token',
          })
        );
      }
      if (input === '/api/internal/v1/discovery-runs') {
        return Promise.resolve(
          jsonResponse(
            { run: { id: 'run-1', status: 'PENDING' }, idempotent: false },
            202
          )
        );
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();
    const user = userEvent.setup();

    render(<NewDiscoveryRunPage locale="zh" navigate={navigate} />);

    expect(screen.getByRole('button', { name: '预览更新范围' })).toBeDisabled();
    await user.click(
      screen.getByRole('radio', { name: 'CIViC 公开知识库（试点）' })
    );
    await user.type(
      screen.getByRole('searchbox', { name: '搜索基因' }),
      'EGFR'
    );
    await user.click(await screen.findByRole('button', { name: '添加 EGFR' }));
    await user.click(screen.getByRole('button', { name: '预览更新范围' }));

    expect(await screen.findByText('预计匹配 23 篇文献')).toBeVisible();
    const previewRequest = fetchMock.mock.calls.find(
      ([input]) => input === '/api/internal/v1/discovery-runs/preview'
    )?.[1] as RequestInit;
    expect(JSON.parse(String(previewRequest.body))).toEqual({
      source: 'CIVIC',
      scope: {
        mode: 'SCOPED',
        diseaseIds: [],
        geneIds: ['gene_egfr'],
        variantIds: [],
      },
      documentLimit: 50,
    });

    await user.click(screen.getByRole('button', { name: '确认并发起更新' }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/zh/ops/discovery-runs/run-1')
    );
  });

  it('requires a second explicit confirmation before processing all literature', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        snapshot: {
          mode: 'ALL_KNOWLEDGE',
          diseaseIds: [],
          geneIds: [],
          variantIds: [],
          aliasVersion: 'aliases-1',
          knowledgeReleaseId: 'release-1',
          knowledgeReleaseVersion: 'v1.0.0',
        },
        documentLimit: 'ALL',
        window: {
          from: '2026-06-01T00:00:00.000Z',
          to: '2026-09-01T00:00:00.000Z',
        },
        queries: [],
        estimatedMatchCount: 420,
        warnings: ['处理时间和资源消耗可能较高。'],
        previewHash: 'preview-all',
        expiresAt: '2099-09-16T00:15:00.000Z',
        previewToken: 'preview-token',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<NewDiscoveryRunPage locale="zh" navigate={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: '全部已发布知识' }));
    await user.click(screen.getByRole('radio', { name: '全部文献' }));
    await user.click(screen.getByRole('button', { name: '预览更新范围' }));
    await screen.findByText('预计匹配 420 篇文献');
    await user.click(screen.getByRole('button', { name: '发起更新' }));

    expect(
      screen.getByRole('button', { name: '确认并处理全部文献' })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submits a single PMID into the governed review flow', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'association-1',
              diseaseDisplayNameZh: '非小细胞肺癌',
              geneSymbol: 'EGFR',
              canonicalKey: 'EGFR|SNV|p.L858R',
              drugs: [{ displayNameZh: '奥希替尼' }],
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { candidateId: 'candidate-1', reviewTaskId: 'review-1' },
          201
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<CandidateIntake locale="zh" />);
    await user.type(screen.getByLabelText('PubMed PMID'), '29151359');
    await user.selectOptions(
      await screen.findByLabelText('对应治疗关联'),
      'association-1'
    );
    await user.click(screen.getByRole('button', { name: '添加并开始整理' }));

    expect(await screen.findByText('文献已进入整理流程')).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/internal/v1/candidates',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          pmid: '29151359',
          associationId: 'association-1',
        }),
      })
    );
  });

  it('shows a navigable review queue with status filtering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 'review-1',
              status: 'READY_FOR_REVIEW',
              title: 'Original English Literature Title',
              pmid: '29151359',
              proposedLevel: '1',
              hasBlockingIssues: false,
              createdAt: '2026-09-16T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      )
    );

    render(<ReviewQueuePage locale="zh" />);

    expect(
      await screen.findByRole('heading', { name: '待审核证据' })
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '开始审核' })).toHaveAttribute(
      'href',
      '/zh/ops/reviews/review-1'
    );
  });

  it('restores the complete review queue filter set from the URL and clears it', async () => {
    window.history.replaceState(
      {},
      '',
      '/zh/ops/reviews?q=FLAURA&status=IN_REVIEW&waitingAge=72h&diseaseId=disease-nsclc&geneId=gene-egfr&variantId=variant-l858r&risk=HIGH&blocking=true&page=2'
    );
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [],
        pagination: { page: 2, pageSize: 20, total: 0, totalPages: 1 },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ReviewQueuePage locale="zh" />);

    expect(await screen.findByLabelText('等待时长')).toHaveValue('72h');
    expect(screen.getByLabelText('疾病')).toHaveValue('disease-nsclc');
    expect(screen.getByLabelText('基因')).toHaveValue('gene-egfr');
    expect(screen.getByLabelText('变异')).toHaveValue('variant-l858r');
    expect(screen.getByLabelText('风险等级')).toHaveValue('HIGH');
    expect(screen.getByLabelText('阻断问题')).toHaveValue('true');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/internal/v1/review-tasks?page=2&pageSize=20&q=FLAURA&status=IN_REVIEW&waitingAge=72h&diseaseId=disease-nsclc&geneId=gene-egfr&variantId=variant-l858r&risk=HIGH&blocking=true',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    await user.click(screen.getByRole('button', { name: '清空筛选' }));
    await waitFor(() => {
      expect(window.location.search).toBe('');
    });
    expect(screen.getByLabelText('等待时长')).toHaveValue('');
    expect(screen.getByLabelText('疾病')).toHaveValue('');
    expect(screen.getByLabelText('基因')).toHaveValue('');
    expect(screen.getByLabelText('变异')).toHaveValue('');
  });

  it('pauses and resumes a discovery run from its detail page', async () => {
    const runDetail = {
      run: {
        id: 'run-1',
        status: 'RUNNING',
        scopeMode: 'SCOPED',
        documentLimit: 50,
        estimatedMatchCount: 30,
        uniqueDiscoveredCount: 10,
        processedDocumentCount: 4,
        counts: {
          discovered: 10,
          duplicate: 1,
          excluded: 0,
          processing: 1,
          readyForReview: 2,
          published: 0,
          failed: 0,
        },
        createdAt: '2026-09-16T00:00:00.000Z',
      },
      strategy: { name: 'EGFR 更新' },
      queries: [],
      candidates: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(runDetail))
      .mockResolvedValueOnce(
        jsonResponse({ ...runDetail.run, status: 'PAUSED' })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...runDetail,
          run: { ...runDetail.run, status: 'PAUSED' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<DiscoveryRunDetailPage locale="zh" id="run-1" />);
    await user.click(await screen.findByRole('button', { name: '暂停运行' }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/internal/v1/discovery-runs/run-1/pause',
      expect.objectContaining({ method: 'POST' })
    );
    expect(
      await screen.findByRole('button', { name: '继续运行' })
    ).toBeVisible();
  });

  it('marks the current operations section and returns focus when closing mobile navigation', async () => {
    window.history.replaceState({}, '', '/zh/ops/candidates');
    const user = userEvent.setup();

    render(
      <OpsShell locale="zh">
        <p>运营内容</p>
      </OpsShell>
    );

    expect(screen.getByRole('link', { name: '候选证据' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    const trigger = screen.getByRole('button', { name: '打开运营导航' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('renders a real operations collection without exposing raw JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          items: [
            {
              id: 'candidate-1',
              title: 'Osimertinib in Untreated EGFR-Mutated Advanced NSCLC',
              status: 'READY_FOR_REVIEW',
              sourceType: 'PUBMED',
              createdAt: '2026-09-16T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      )
    );

    render(<OpsCollectionPage locale="zh" resource="candidates" />);

    expect(
      await screen.findByRole('heading', { name: '候选证据' })
    ).toBeVisible();
    expect(
      screen.getByText('Osimertinib in Untreated EGFR-Mutated Advanced NSCLC')
    ).toBeVisible();
    expect(screen.getByText('等待审核')).toBeVisible();
    expect(screen.queryByText(/\{"id"/)).not.toBeInTheDocument();
  });

  it('copies, edits, evaluates, activates, audits, and rolls back an agent version', async () => {
    const activeAgent = {
      id: 'extraction-agent@1.0.0',
      agentId: 'extraction-agent',
      version: '1.0.0',
      name: '证据提取智能体',
      goal: '提取可追溯证据',
      instructionsVersion: 'extract-v1',
      allowedSkillVersions: ['extract@1.0.0'],
      allowedTools: ['structured-output'],
      modelConfiguration: { model: 'gpt-5.6-terra' },
      tokenAndCostBudget: { maxInputTokens: 10000 },
      stopConditions: ['draft_valid'],
      handoffConditions: ['needs_human'],
      failurePolicy: { maxAttempts: 2 },
      status: 'ACTIVE',
      createdAt: '2026-09-16T00:00:00.000Z',
    };
    const draftAgent = {
      ...activeAgent,
      id: 'extraction-agent@1.1.0',
      version: '1.1.0',
      status: 'DRAFT',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [activeAgent],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      )
      .mockResolvedValueOnce(jsonResponse(draftAgent, 201))
      .mockResolvedValueOnce(
        jsonResponse({ ...draftAgent, goal: '提取并核验多条可追溯证据' })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          versionId: draftAgent.id,
          suiteId: 'schema-baseline-v1',
          status: 'PASSED',
          checks: [{ id: 'schema_valid', status: 'PASSED' }],
          evaluatedAt: '2026-09-16T01:00:00.000Z',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ...draftAgent, status: 'ACTIVE' }))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 'audit-1',
              action: 'DEFINITION_VERSION_ACTIVATED',
              actorId: 'reviewer-1',
              createdAt: '2026-09-16T01:01:00.000Z',
              details: { versionId: draftAgent.id },
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ ...activeAgent, status: 'ACTIVE' })
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<DefinitionManagementPage locale="zh" kind="agents" />);

    expect(
      await screen.findByRole('heading', { name: '智能体配置' })
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: '复制为草稿' }));
    await user.type(screen.getByLabelText('新版本号'), '1.1.0');
    await user.click(screen.getByRole('button', { name: '创建草稿版本' }));

    const goal = await screen.findByLabelText('智能体目标');
    await user.clear(goal);
    await user.type(goal, '提取并核验多条可追溯证据');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    await user.click(screen.getByRole('button', { name: '运行评估' }));
    expect(await screen.findByText('评估通过')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '激活版本' }));
    expect(await screen.findByText('版本已激活')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '查看审计记录' }));
    expect(await screen.findByText('激活了版本')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '关闭审计记录' }));

    await user.click(screen.getByRole('button', { name: '回滚到此版本' }));
    await user.type(screen.getByLabelText('回滚原因'), '新版本需要继续观察');
    await user.click(screen.getByRole('button', { name: '确认回滚' }));
    expect(await screen.findByText('版本已回滚')).toBeVisible();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/internal/v1/agents/extraction-agent/versions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sourceVersionId: 'extraction-agent@1.0.0',
          version: '1.1.0',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/internal/v1/agents/extraction-agent/versions/extraction-agent%401.1.0',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('loads the three-column review workspace and saves an edited draft', async () => {
    const persistedFixture = reviewTaskFixture({ draftVersion: 2 });
    persistedFixture.draft.claims[0].conclusion = '更新后的中文结论';
    persistedFixture.draft.claims[1].limitations = '安全性摘要信息有限。';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewTaskFixture()))
      .mockResolvedValueOnce(jsonResponse({ id: 'review-1', draftVersion: 2 }))
      .mockResolvedValueOnce(jsonResponse(persistedFixture));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ReviewWorkspace locale="zh" id="review-1" />);

    expect(
      await screen.findByRole('heading', { name: '来源原文' })
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '结构化草稿' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '质量检查' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '证据结论 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '证据结论 2' })).toBeVisible();

    const conclusion = screen.getByLabelText('证据结论 1·结论');
    await user.clear(conclusion);
    await user.type(conclusion, '更新后的中文结论');
    await user.click(conclusion);
    expect(
      screen.getByRole('combobox', {
        name: 'Abstract Results · 第 2 句的依据角色',
      })
    ).toHaveValue('PRIMARY');
    expect(screen.getByText('Abstract Results · 第 2 句')).toBeVisible();
    expect(
      screen.getByText('Progression-free survival improved.')
    ).toHaveAttribute('data-highlighted', 'true');
    const secondLimitations = screen.getByLabelText('证据结论 2·局限性');
    await user.clear(secondLimitations);
    await user.type(secondLimitations, '安全性摘要信息有限。');
    await user.type(screen.getByLabelText('修改原因'), '补充适用范围');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/internal/v1/review-tasks/review-1/draft'
    );
    const draftRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(draftRequest.method).toBe('PATCH');
    const submitted = JSON.parse(String(draftRequest.body));
    expect(submitted).toEqual({
      expectedDraftVersion: 1,
      draft: expect.objectContaining({
        associationId: 'assoc-1',
        passages: expect.arrayContaining([
          expect.objectContaining({ id: 'passage-primary' }),
        ]),
        claims: [
          expect.objectContaining({
            id: 'claim-1',
            conclusion: '更新后的中文结论',
          }),
          expect.objectContaining({
            id: 'claim-2',
            limitations: '安全性摘要信息有限。',
          }),
        ],
        fieldProvenance: expect.objectContaining({
          'claims.0.conclusion': ['passage-primary'],
        }),
      }),
      reason: '补充适用范围',
    });
    expect(await screen.findByText('草稿已保存')).toBeVisible();
    expect(screen.getByText('草稿第 2 版')).toBeVisible();
    expect(screen.getByLabelText('证据结论 1·结论')).toHaveValue(
      '更新后的中文结论'
    );
  });

  it('edits a structured effect value and its source mapping before saving', async () => {
    let serverFixture: Record<string, unknown> = reviewTaskFixture();
    const submittedDrafts: EvidenceDraftInput[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/draft') && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body)) as {
            draft: EvidenceDraftInput;
          };
          submittedDrafts.push(body.draft);
          serverFixture = {
            ...serverFixture,
            draftVersion: 2,
            draft: body.draft,
          };
          return jsonResponse({ id: 'review-1', draftVersion: 2 });
        }
        return jsonResponse(serverFixture);
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ReviewWorkspace locale="zh" id="review-1" />);

    const hazardRatio = await screen.findByLabelText('证据结论 1·风险比（HR）');
    await user.clear(hazardRatio);
    await user.type(hazardRatio, '0');
    expect(screen.getByText('风险比（HR）必须大于 0')).toBeVisible();
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled();

    await user.clear(hazardRatio);
    await user.type(hazardRatio, '0.52');
    expect(screen.getByText('Abstract Results · 第 2 句')).toBeVisible();
    const contextMapping = screen.getByRole('checkbox', {
      name: '关联 Abstract Methods · 第 1 段到当前字段',
    });
    expect(contextMapping).not.toBeChecked();
    await user.click(contextMapping);
    await user.selectOptions(
      screen.getByRole('combobox', {
        name: 'Abstract Methods · 第 1 段的依据角色',
      }),
      'PRIMARY'
    );
    await user.type(screen.getByLabelText('修改原因'), '核对效应量及来源');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const saved = submittedDrafts[0];
    expect(saved).toBeDefined();
    if (!saved) throw new Error('预期提交完整审核草稿');
    expect(saved.claims[0]?.effectValue).toEqual({ hazardRatio: 0.52 });
    expect(saved.claims[0]?.passageIds).toContain('passage-context');
    expect(saved.fieldProvenance['claims.0.effectValue']).toEqual([
      'passage-context',
    ]);
    expect(saved.passages).toContainEqual(
      expect.objectContaining({
        id: 'passage-context',
        supportRole: 'PRIMARY',
      })
    );
    expect(await screen.findByText('草稿已保存')).toBeVisible();
    expect(screen.getByLabelText('证据结论 1·风险比（HR）')).toHaveValue(0.52);
  });

  it('requires requested fields for changes and a reason for rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(reviewTaskFixture()));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ReviewWorkspace locale="zh" id="review-1" />);
    await user.click(await screen.findByRole('button', { name: '退回修改' }));
    expect(screen.getByRole('button', { name: '确认退回' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '结论' }));
    expect(screen.getByRole('button', { name: '确认退回' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '拒绝候选' }));
    expect(screen.getByRole('button', { name: '确认拒绝' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('拒绝原因'),
      '研究对象不符合收录范围'
    );
    expect(screen.getByRole('button', { name: '确认拒绝' })).toBeEnabled();
  });

  it('summarizes publication changes, requires an approval note, and locks the published task', async () => {
    const publishedFixture = reviewTaskFixture({
      status: 'PUBLISHED',
      publishedReleaseId: 'release-next',
      currentRelease: { id: 'release-next', version: 'v0.2.1' },
      expectedNextRelease: 'v0.2.2',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewTaskFixture()))
      .mockResolvedValueOnce(
        jsonResponse({
          reviewTaskId: 'review-1',
          decision: 'APPROVE_AND_PUBLISH',
          status: 'PUBLISHED',
          releaseId: 'release-next',
          releaseVersion: 'v0.2.1',
          idempotent: false,
        })
      )
      .mockResolvedValueOnce(jsonResponse(publishedFixture));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ReviewWorkspace locale="zh" id="review-1" />);
    await user.click(await screen.findByRole('button', { name: '审核并发布' }));

    const summary = screen.getByRole('region', { name: '发布变更摘要' });
    expect(summary).toHaveTextContent('本次拟发布内容');
    expect(summary).toHaveTextContent('拟新增证据结论2 条');
    expect(summary).toHaveTextContent('修改已发布结论0 条');
    expect(summary).toHaveTextContent('当前发布版本v0.2.0');
    expect(summary).toHaveTextContent('发布后版本v0.2.1');
    expect(summary).toHaveTextContent('证据等级2B → 3A');
    expect(summary).toHaveTextContent('成熟临床研究支持该治疗关联。');
    expect(summary).toHaveTextContent('PMID 12345678');
    expect(summary).toHaveTextContent('PubMed 摘要');
    expect(summary).toHaveTextContent('随机对照 III 期试验');
    expect(summary).toHaveTextContent('晚期 EGFR 突变非小细胞肺癌人群');
    expect(summary).toHaveTextContent('无进展生存期');
    expect(summary).toHaveTextContent('危险比：0.46');
    expect(summary).toHaveTextContent('奥希替尼改善无进展生存期。');
    expect(summary).toHaveTextContent('开放标签设计。');

    const approvalNote = screen.getByLabelText('批准说明（必填）');
    const confirmButton = screen.getByRole('button', {
      name: '确认审核并发布',
    });
    expect(approvalNote).toBeRequired();
    expect(approvalNote).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('批准发布前必须填写审核说明。')).toBeVisible();
    expect(confirmButton).toBeDisabled();

    await user.type(approvalNote, '已复核研究设计、效应量与原文定位。');
    expect(approvalNote).toHaveAttribute('aria-invalid', 'false');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(await screen.findByText('已发布到知识版本 v0.2.1')).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const decisionRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(decisionRequest.body))).toMatchObject({
      decision: 'APPROVE_AND_PUBLISH',
      expectedDraftVersion: 1,
      comment: '已复核研究设计、效应量与原文定位。',
    });
    expect(screen.getByRole('button', { name: '退回修改' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝候选' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '审核并发布' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled();
  });

  it('shows unmapped provenance and recovers from a draft version conflict', async () => {
    const fixture = reviewTaskFixture();
    const draft = fixture.draft as Record<string, unknown>;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ...fixture,
          draft: {
            ...draft,
            fieldProvenance: {
              ...(draft.fieldProvenance as Record<string, string[]>),
              'claims.0.studyType': undefined,
            },
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: -1,
            message: 'DRAFT_VERSION_CONFLICT',
            details: { currentVersion: 2 },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        jsonResponse(reviewTaskFixture({ draftVersion: 2 }))
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<ReviewWorkspace locale="zh" id="review-1" />);
    const studyType = await screen.findByLabelText('证据结论 1·研究类型');
    await user.click(studyType);
    expect(screen.getByRole('alert')).toHaveTextContent(
      '这个字段没有可定位的原文依据'
    );

    await user.clear(studyType);
    await user.type(studyType, '更新后的研究类型');
    await user.type(screen.getByLabelText('修改原因'), '修正研究设计');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));

    expect(await screen.findByText('草稿已被其他审核者更新')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '重新读取最新草稿' }));
    expect(await screen.findByText('草稿第 2 版')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);
});
