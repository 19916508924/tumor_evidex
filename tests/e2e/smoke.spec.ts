import { expect, test } from '@playwright/test';

function envelope(data: unknown) {
  return { code: 0, message: 'ok', data };
}

function errorEnvelope(message: string, details?: unknown) {
  return { code: -1, message, ...(details ? { details } : {}) };
}

function discoveryRunDetail(status: string) {
  return {
    run: {
      id: 'run-e2e',
      status,
      scopeMode: 'SCOPED',
      documentLimit: 50,
      estimatedMatchCount: 23,
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
}

function reviewTaskFixture(draftVersion = 1) {
  return {
    id: 'review-e2e',
    status: 'READY_FOR_REVIEW',
    draftId: 'draft-e2e',
    draftVersion,
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
      id: 'candidate-e2e',
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
      associationId: 'assoc-e2e',
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
          passageIds: ['passage-primary', 'passage-limit'],
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
        'claims.0.limitations': ['passage-limit'],
        'claims.1.conclusion': ['passage-primary'],
        'claims.1.limitations': ['passage-limit'],
      },
      editedBy: null,
      editReason: null,
    },
    history: [],
  };
}

test('English landing page renders without uncaught browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(
    'See more of the patient. Match drugs and clinical trials with comprehensive evidence.'
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const origin = new URL(page.url()).origin;
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${origin}/`
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="en"]')
  ).toHaveCount(1);
  await expect(
    page.locator('link[rel="alternate"][hreflang="zh"]')
  ).toHaveCount(1);
  await expect(
    page.locator('link[rel="alternate"][hreflang="zh"]')
  ).toHaveAttribute('href', `${origin}/zh`);
  const currentDemo = page
    .getByRole('link', {
      name: 'Ask Evidex',
      exact: true,
    })
    .first();
  await expect(currentDemo).toHaveAttribute('href', '/zh/ask');
  await expect(page.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Showcases' })).toHaveCount(0);
  await expect(page.locator('main > section')).toHaveCount(11);
  await expect(page.getByText('v0.2.0', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Planned', { exact: true }).first()
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Chinese landing page renders with the correct locale', async ({
  page,
}) => {
  const response = await page.goto('/zh');
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(
    '看见更多患者细节，用全面证据匹配药物与临床试验'
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh');
  await expect(page.locator('main > section')).toHaveCount(11);
  await expect(page.getByRole('link', { name: '价格' })).toHaveCount(0);
  await expect(page.getByText('规划中', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: '证据问答' })
  ).toHaveAttribute('href', '/zh/ask');
});

test('landing page enters the complete Chinese evidence product', async ({
  page,
}) => {
  await page.goto('/zh');
  await page
    .getByRole('link', { name: '进入证据问答', exact: true })
    .first()
    .click();

  await expect(page).toHaveURL(/\/zh\/ask$/);
  await expect(
    page.getByRole('heading', { name: '把问题交给证据，而不是猜测' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '知识库', exact: true })
  ).toHaveAttribute('href', '/zh/knowledge');
  await expect(page.locator('body')).not.toContainText(
    /后端|接口|体验版|V0\.2|知识库版本/i
  );
});

test('desktop demo opens review from public navigation and requests changes anonymously', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.clearCookies();
  expect(await context.cookies()).toEqual([]);
  let task = reviewTaskFixture();
  let submittedDecision: Record<string, unknown> | null = null;

  await page.route('**/api/internal/v1/review-tasks**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (
      request.method() === 'POST' &&
      url.pathname.endsWith('/review-e2e/decision')
    ) {
      submittedDecision = request.postDataJSON() as Record<string, unknown>;
      task = { ...task, status: 'REQUESTED_CHANGES' };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            reviewTaskId: 'review-e2e',
            decision: 'REQUEST_CHANGES',
            status: 'REQUESTED_CHANGES',
            releaseId: null,
            releaseVersion: null,
            idempotent: false,
          })
        ),
      });
      return;
    }

    if (url.pathname.endsWith('/review-e2e')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(task)),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          items: [
            {
              id: 'review-e2e',
              status: 'READY_FOR_REVIEW',
              title: 'Original English Literature Title',
              pmid: '12345678',
              proposedLevel: '3A',
              hasBlockingIssues: false,
              risk: 'LOW',
              waitingHours: 3,
              disease: { id: 'disease-nsclc', name: '非小细胞肺癌' },
              gene: { id: 'gene-egfr', symbol: 'EGFR' },
              variant: { id: 'variant-l858r', hgvsp: 'p.L858R' },
              assignedTo: null,
              createdAt: '2026-09-16T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      ),
    });
  });

  const opsResponse = await page.goto('/zh/ops');
  expect(opsResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/zh\/ops$/);
  await expect(
    page.getByRole('heading', { name: '证据运营总览' })
  ).toBeVisible();

  await page.goto('/zh/knowledge');
  await page.getByRole('link', { name: '证据审核', exact: true }).click();

  await expect(page).toHaveURL(/\/zh\/ops\/reviews$/);
  await expect(
    page.getByRole('heading', { name: '待审核证据', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Original English Literature Title')
  ).toBeVisible();
  await page.getByRole('link', { name: '开始审核' }).click();

  await expect(page).toHaveURL(/\/zh\/ops\/reviews\/review-e2e$/);
  await expect(
    page.getByRole('heading', { name: '医学审核工作台' })
  ).toBeVisible();
  await page.getByRole('button', { name: '退回修改' }).click();
  await page.getByLabel('结论', { exact: true }).check();
  await page.getByRole('button', { name: '确认退回' }).click();

  await expect(page.getByRole('status')).toContainText('已退回修改');
  expect(submittedDecision).toMatchObject({
    decision: 'REQUEST_CHANGES',
    expectedDraftVersion: 1,
    requestedFields: ['claims.conclusion'],
  });
});

test('landing page API example copies and keeps one desktop navigation row', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3100',
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Copy API request' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Evidence review', exact: true })
  ).toHaveAttribute('href', '/en/ops/reviews');
  await expect(
    page.getByRole('button', { name: 'Open navigation' })
  ).toHaveCount(0);
});

test('landing page remains visible when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('main > section')).toHaveCount(11);
});

test('Evidex evidence page exposes the public query experience', async ({
  page,
}) => {
  const response = await page.goto('/zh/evidence');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: '探索与基因变异相关的治疗证据' })
  ).toBeVisible();
  await expect(
    page.getByText('资料来源覆盖 PubMed 文献与美国药监局公开记录')
  ).toBeVisible();
  await expect(page.getByLabel('癌种')).toHaveValue('NSCLC');
  await expect(page.getByLabel('基因')).toHaveValue('EGFR');
  await expect(page.getByLabel('蛋白变异')).toHaveValue('EGFR|SNV|p.L858R');
  await expect(
    page.getByRole('button', { name: '查看治疗证据' })
  ).toBeEnabled();
  await expect(page.locator('body')).not.toContainText(
    /V0\.2|体验版|后端|知识版本|接口：/
  );
});

test('protected pages redirect anonymous users and preserve their destination', async ({
  request,
}) => {
  const response = await request.get('/settings/profile', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBeTruthy();
  const target = new URL(response.headers().location, response.url());
  expect(target.pathname).toBe('/sign-in');
  expect(target.searchParams.get('callbackUrl')).toBe('/settings/profile');
});

test('anonymous API access returns the documented error envelope', async ({
  request,
}) => {
  const response = await request.post('/api/user/get-user-info');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    code: -1,
    message: 'no auth, please sign in',
  });
});

test('knowledge search opens a complete entity detail on the minimum desktop viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.route('**/api/v1/knowledge/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/variants/variant_l858r')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            release: {
              id: 'release-1',
              version: 'v1.0.0',
              publishedAt: '2026-09-16T00:00:00.000Z',
            },
            entity: {
              id: 'variant_l858r',
              type: 'variant',
              canonicalName: 'EGFR p.L858R',
              displayNameZh: 'EGFR L858R',
              displayNameEn: 'EGFR p.L858R',
              aliases: ['L858R'],
            },
            associations: [
              {
                id: 'association-1',
                approvedLevel: '1',
                direction: 'SENSITIVITY',
                claimCount: 2,
                disease: {
                  id: 'disease-nsclc',
                  displayNameZh: '非小细胞肺癌',
                },
                gene: { id: 'gene-egfr', symbol: 'EGFR' },
                variant: { id: 'variant_l858r', hgvsp: 'p.L858R' },
                drugs: [{ id: 'drug-1', displayNameZh: '奥希替尼' }],
              },
            ],
            related: { diseases: [], genes: [], variants: [], drugs: [] },
          })
        ),
      });
      return;
    }
    if (url.pathname.endsWith('/diseases')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            items: [
              {
                id: 'disease-nsclc',
                type: 'disease',
                canonicalName: 'NSCLC',
                displayNameZh: '非小细胞肺癌',
                displayNameEn: 'Non-small cell lung cancer',
                aliases: [],
              },
            ],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          })
        ),
      });
      return;
    }
    if (url.pathname.endsWith('/genes')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            items: [
              {
                id: 'gene-egfr',
                type: 'gene',
                canonicalName: 'EGFR',
                displayNameZh: 'EGFR',
                displayNameEn: 'epidermal growth factor receptor',
                aliases: [],
              },
            ],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          })
        ),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          release: { id: 'release-1', version: 'v1.0.0' },
          items: [
            {
              id: 'variant_l858r',
              type: 'variant',
              canonicalName: 'EGFR p.L858R',
              displayNameZh: 'EGFR L858R',
              displayNameEn: 'EGFR p.L858R',
              aliases: ['L858R'],
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        })
      ),
    });
  });

  await page.goto('/zh/knowledge/variants');
  await page.getByRole('searchbox').fill('L858R');
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByRole('link', { name: /EGFR L858R/ }).click();

  await expect(page).toHaveURL(/\/zh\/knowledge\/variants\/variant_l858r$/);
  await expect(page.getByRole('heading', { name: 'EGFR L858R' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '关联证据' })).toBeVisible();
  await expect(page.getByText('非小细胞肺癌 · EGFR · p.L858R')).toBeVisible();
});

test('evidence question submits, polls, and exposes validated citations', async ({
  page,
}) => {
  await page.route('**/api/v1/evidence-questions**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            questionRunId: 'question-e2e',
            status: 'PENDING',
            pollAfterMs: 0,
          })
        ),
      });
      return;
    }
    if (url.pathname.endsWith('/question-e2e')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            id: 'question-e2e',
            questionRunId: 'question-e2e',
            status: 'ANSWERED',
            progress: 'COMPLETED',
            pollAfterMs: null,
            question: 'EGFR L858R 有哪些已审核证据？',
            knowledgeRelease: { version: 'v1.0.0' },
            completedAt: '2026-09-16T00:00:00.000Z',
            result: {
              status: 'ANSWERED',
              answer: {
                overallSummary: '奥希替尼具有同疾病、精确变异的已审核证据。',
                groups: [
                  {
                    scope: 'SAME_DISEASE',
                    therapies: [
                      {
                        associationId: 'association-1',
                        overview: '奥希替尼相关证据',
                        statements: [
                          {
                            text: '研究显示无进展生存期改善。',
                            evidenceIds: ['claim-1'],
                          },
                        ],
                        limitations: ['仍需结合完整临床背景理解。'],
                      },
                    ],
                  },
                ],
              },
              resultGroups: [],
              generatedAt: '2026-09-16T00:00:00.000Z',
              disclaimer: '仅用于肿瘤知识学习与研究。',
            },
          })
        ),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/zh/ask');
  await page
    .getByRole('textbox', { name: '你的证据问题' })
    .fill('EGFR L858R 有哪些已审核证据？');
  await page.getByRole('button', { name: '查找证据' }).click();

  await expect(
    page.getByText('奥希替尼具有同疾病、精确变异的已审核证据。')
  ).toBeVisible();
  await expect(page.getByText('已完成引用校验')).toBeVisible();
  await expect(page.getByRole('link', { name: '查看证据' })).toHaveAttribute(
    'href',
    '/zh/knowledge/evidence/claim-1'
  );
});

for (const state of [
  {
    status: 'NEEDS_CLARIFICATION',
    title: '还需要一点信息',
    result: { status: 'NEEDS_CLARIFICATION', missingFields: ['disease'] },
  },
  {
    status: 'NO_CURATED_EVIDENCE',
    title: '没有找到已审核证据',
    result: { status: 'NO_CURATED_EVIDENCE' },
  },
] as const) {
  test(`evidence question renders ${state.status} without inventing an answer`, async ({
    page,
  }) => {
    await page.route('**/api/v1/evidence-questions**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify(
            envelope({
              questionRunId: `question-${state.status}`,
              status: 'PENDING',
              pollAfterMs: 0,
            })
          ),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            id: `question-${state.status}`,
            questionRunId: `question-${state.status}`,
            status: state.status,
            progress: 'COMPLETED',
            pollAfterMs: null,
            question: '这个变异有哪些证据？',
            knowledgeRelease: { version: 'v1.0.0' },
            result: state.result,
          })
        ),
      });
    });
    await page.goto('/zh/ask');
    await page
      .getByRole('textbox', { name: '你的证据问题' })
      .fill('这个变异有哪些证据？');
    await page.getByRole('button', { name: '查找证据' }).click();
    await expect(
      page.getByRole('heading', { name: state.title })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '结论' })).toHaveCount(0);
  });
}

test('a failed evidence question retries through a new saved run', async ({
  page,
}) => {
  await page.route('**/api/v1/evidence-questions**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/retry')) {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            questionRunId: 'question-retry',
            status: 'PENDING',
            pollAfterMs: 0,
            idempotent: false,
          })
        ),
      });
      return;
    }
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            questionRunId: 'question-failed',
            status: 'PENDING',
            pollAfterMs: 0,
          })
        ),
      });
      return;
    }
    const retried = url.pathname.endsWith('/question-retry');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          id: retried ? 'question-retry' : 'question-failed',
          questionRunId: retried ? 'question-retry' : 'question-failed',
          status: retried ? 'ANSWERED' : 'FAILED',
          progress: 'COMPLETED',
          pollAfterMs: null,
          question: 'EGFR L858R 有哪些证据？',
          knowledgeRelease: { version: 'v1.0.0' },
          result: retried
            ? {
                status: 'ANSWERED',
                answer: {
                  overallSummary: '重试后的已审核回答。',
                  groups: [],
                },
                resultGroups: [],
                disclaimer: '仅用于肿瘤知识学习与研究。',
              }
            : { status: 'FAILED', message: '生成未完成' },
        })
      ),
    });
  });

  await page.goto('/zh/ask');
  await page
    .getByRole('textbox', { name: '你的证据问题' })
    .fill('EGFR L858R 有哪些证据？');
  await page.getByRole('button', { name: '查找证据' }).click();
  await page.getByRole('button', { name: '重新整理回答' }).click();

  await expect(page.getByText('重试后的已审核回答。')).toBeVisible();
  await expect(page).toHaveURL(/\?run=question-retry$/);
});

test('manual discovery previews, creates, pauses, resumes, and cancels a run', async ({
  page,
}) => {
  let runStatus = 'RUNNING';
  await page.route('**/api/v1/knowledge/genes?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
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
      ),
    });
  });
  await page.route('**/api/internal/v1/discovery-runs**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/preview')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
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
        ),
      });
      return;
    }
    if (
      request.method() === 'POST' &&
      url.pathname === '/api/internal/v1/discovery-runs'
    ) {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            run: { id: 'run-e2e', status: 'PENDING' },
            idempotent: false,
          })
        ),
      });
      return;
    }
    const action = url.pathname.match(/\/(pause|resume|cancel)$/)?.[1];
    if (request.method() === 'POST' && action) {
      runStatus =
        action === 'pause'
          ? 'PAUSED'
          : action === 'resume'
            ? 'RUNNING'
            : 'CANCELLED';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ id: 'run-e2e', status: runStatus })),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope(discoveryRunDetail(runStatus))),
    });
  });

  await page.goto('/zh/ops/discovery-runs/new');
  await page.getByRole('searchbox', { name: '搜索基因' }).fill('EGFR');
  await page.getByRole('button', { name: '添加 EGFR' }).click();
  await page.getByRole('button', { name: '预览更新范围' }).click();
  await expect(page.getByText('预计匹配 23 篇文献')).toBeVisible();
  await page.getByRole('button', { name: '确认并发起更新' }).click();

  await expect(page).toHaveURL(/\/zh\/ops\/discovery-runs\/run-e2e$/);
  await page.getByRole('button', { name: '暂停运行' }).click();
  await expect(page.getByRole('button', { name: '继续运行' })).toBeVisible();
  await page.getByRole('button', { name: '继续运行' }).click();
  await expect(page.getByRole('button', { name: '暂停运行' })).toBeVisible();
  await page.getByRole('button', { name: '取消运行' }).click();
  await page.getByRole('button', { name: '确认取消运行' }).click();
  await expect(page.getByText('运行已取消')).toBeVisible();
  await expect(page.getByRole('button', { name: '暂停运行' })).toHaveCount(0);
});

test('review revises multiple claims, an effect value, provenance, and publishes', async ({
  page,
}) => {
  let task: Record<string, unknown> = reviewTaskFixture();
  let savedClaims: Array<Record<string, unknown>> = [];
  let decisionBody: Record<string, unknown> | null = null;
  await page.route(
    '**/api/internal/v1/review-tasks/review-e2e**',
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'PATCH' && url.pathname.endsWith('/draft')) {
        const body = request.postDataJSON() as {
          draft: Record<string, unknown>;
        };
        savedClaims = body.draft.claims as Array<Record<string, unknown>>;
        task = { ...task, draftVersion: 2, draft: body.draft };
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(envelope({ id: 'review-e2e', draftVersion: 2 })),
        });
        return;
      }
      if (request.method() === 'POST' && url.pathname.endsWith('/decision')) {
        decisionBody = request.postDataJSON() as Record<string, unknown>;
        task = {
          ...task,
          status: 'PUBLISHED',
          publishedReleaseId: 'release-next',
          currentRelease: { id: 'release-next', version: 'v0.2.1' },
          expectedNextRelease: 'v0.2.2',
        };
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            envelope({
              reviewTaskId: 'review-e2e',
              decision: 'APPROVE_AND_PUBLISH',
              status: 'PUBLISHED',
              releaseId: 'release-next',
              releaseVersion: 'v0.2.1',
              idempotent: false,
            })
          ),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(task)),
      });
    }
  );

  await page.goto('/zh/ops/reviews/review-e2e');
  await expect(page.getByRole('heading', { name: '证据结论 2' })).toBeVisible();
  const conclusion = page.getByRole('textbox', {
    name: '证据结论 1·结论',
    exact: true,
  });
  await conclusion.click();
  await expect(
    page.getByRole('combobox', {
      name: 'Abstract Results · 第 2 句的依据角色',
    })
  ).toHaveValue('PRIMARY');
  await expect(page.getByText('Abstract Results · 第 2 句')).toBeVisible();
  await expect(
    page.getByText('Progression-free survival improved.', { exact: true })
  ).toHaveAttribute('data-highlighted', 'true');
  await conclusion.fill('更新后的中文结论');
  await page.getByLabel('证据结论 2·局限性').fill('安全性摘要信息有限。');
  const hazardRatio = page.getByLabel('证据结论 1·风险比（HR）');
  await hazardRatio.fill('0');
  await expect(
    page.getByText('风险比（HR）必须大于 0', { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '保存草稿' })).toBeDisabled();
  await hazardRatio.fill('0.52');
  await page
    .getByRole('checkbox', {
      name: '关联 Abstract Discussion · 第 3 段到当前字段',
    })
    .check();
  await page.getByLabel('修改原因').fill('补充适用范围');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByText('草稿已保存')).toBeVisible();
  expect(savedClaims[0]?.conclusion).toBe('更新后的中文结论');
  expect(savedClaims[0]?.effectValue).toEqual({ hazardRatio: 0.52 });
  expect(savedClaims[0]?.passageIds).toContain('passage-limit');
  expect(savedClaims[1]?.limitations).toBe('安全性摘要信息有限。');

  const savedDraft = (task.draft ?? {}) as {
    fieldProvenance?: Record<string, string[]>;
  };
  expect(savedDraft.fieldProvenance?.['claims.0.effectValue']).toEqual([
    'passage-limit',
  ]);

  await page.getByRole('button', { name: '审核并发布' }).click();
  const summary = page.getByRole('region', { name: '发布变更摘要' });
  await expect(summary).toContainText('拟新增证据结论2 条');
  await expect(summary).toContainText('修改已发布结论0 条');
  await expect(summary).toContainText('当前发布版本v0.2.0');
  await expect(summary).toContainText('发布后版本v0.2.1');
  await expect(summary).toContainText('证据等级2B → 3A');
  await expect(summary).toContainText('PMID 12345678');
  await expect(summary).toContainText('PubMed 摘要');
  await expect(summary).toContainText('危险比：0.52');
  const approvalNote = page.getByLabel('批准说明（必填）');
  await expect(approvalNote).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('批准发布前必须填写审核说明。')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '确认审核并发布' })
  ).toBeDisabled();
  await approvalNote.fill('已复核研究设计、效应量与原文定位。');
  await page.getByRole('button', { name: '确认审核并发布' }).click();
  await expect(page.getByText('已发布到知识版本 v0.2.1')).toBeVisible();
  await expect(page.getByText('已发布', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '退回修改' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '拒绝候选' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '审核并发布' })).toBeDisabled();
  expect(decisionBody).toMatchObject({
    decision: 'APPROVE_AND_PUBLISH',
    expectedDraftVersion: 2,
    comment: '已复核研究设计、效应量与原文定位。',
  });
});

test('review rejection submits a required reason and refreshes the terminal state', async ({
  page,
}) => {
  let task: Record<string, unknown> = reviewTaskFixture();
  let decisionBody: Record<string, unknown> | null = null;
  await page.route(
    '**/api/internal/v1/review-tasks/review-reject**',
    async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        decisionBody = request.postDataJSON() as Record<string, unknown>;
        task = { ...task, status: 'REJECTED' };
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(envelope({ id: 'review-reject' })),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(task)),
      });
    }
  );

  await page.goto('/zh/ops/reviews/review-reject');
  await page.getByRole('button', { name: '拒绝候选' }).click();
  await expect(page.getByRole('button', { name: '确认拒绝' })).toBeDisabled();
  await page.getByLabel('拒绝原因').fill('研究对象不符合收录范围');
  await page.getByRole('button', { name: '确认拒绝' }).click();

  await expect(page.getByText('已拒绝此候选')).toBeVisible();
  await expect(page.getByText('已拒绝').first()).toBeVisible();
  expect(decisionBody).toMatchObject({
    decision: 'REJECT',
    expectedDraftVersion: 1,
    comment: '研究对象不符合收录范围',
  });
});

test('review exposes an actionable draft conflict', async ({ page }) => {
  await page.route(
    '**/api/internal/v1/review-tasks/review-conflict**',
    async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(
            errorEnvelope('DRAFT_VERSION_CONFLICT', { currentVersion: 2 })
          ),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope(reviewTaskFixture())),
      });
    }
  );

  await page.goto('/zh/ops/reviews/review-conflict');
  await page
    .getByRole('textbox', { name: '证据结论 1·结论', exact: true })
    .fill('冲突结论');
  await page.getByLabel('修改原因').fill('校正结论');
  await page.getByRole('button', { name: '保存草稿' }).click();

  await expect(page.getByText('草稿已被其他审核者更新')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '重新读取最新草稿' })
  ).toBeVisible();
});

test('public and operations surfaces render safe 404, 403, and 500 states', async ({
  page,
}) => {
  await page.route('**/api/v1/knowledge/variants/missing', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify(errorEnvelope('NOT_FOUND')),
    });
  });
  await page.goto('/zh/knowledge/variants/missing');
  await expect(page.getByText('暂时无法读取已发布内容')).toBeVisible();

  await page.route('**/api/internal/v1/agents?**', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify(errorEnvelope('FORBIDDEN')),
    });
  });
  await page.goto('/zh/ops/agents');
  await expect(page.getByText('配置目录暂时无法读取。')).toBeVisible();

  await page.route('**/api/internal/v1/review-tasks?**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify(errorEnvelope('INTERNAL_ERROR')),
    });
  });
  await page.goto('/zh/ops/reviews');
  await expect(page.getByText('审核队列暂时无法读取')).toBeVisible();
});
