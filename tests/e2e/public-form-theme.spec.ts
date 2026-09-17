import { expect, test, type Locator, type Page } from '@playwright/test';

function envelope(data: unknown) {
  return { code: 0, message: 'ok', data };
}

async function useSystemDark(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    window.localStorage.setItem('theme', 'system');
  });
}

async function controlReadability(control: Locator) {
  return control.evaluate((element) => {
    type Color = [number, number, number, number];
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法创建颜色测量画布');

    const parseColor = (value: string): Color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = 'rgba(0, 0, 0, 0)';
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha / 255];
    };

    const composite = (foreground: Color, background: Color): Color => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] +
          background[0] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[1] * foreground[3] +
          background[1] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[2] * foreground[3] +
          background[2] * background[3] * (1 - foreground[3])) /
          alpha,
        alpha,
      ];
    };

    let background: Color = [0, 0, 0, 0];
    let current: Element | null = element;
    while (current) {
      background = composite(
        background,
        parseColor(getComputedStyle(current).backgroundColor)
      );
      if (background[3] >= 0.999) break;
      current = current.parentElement;
    }
    if (background[3] < 0.999) {
      background = composite(background, [255, 255, 255, 1]);
    }

    const luminance = (color: Color) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(color[0]) +
        0.7152 * channel(color[1]) +
        0.0722 * channel(color[2])
      );
    };

    const contrast = (foreground: Color, surface: Color) => {
      const first = luminance(foreground);
      const second = luminance(surface);
      return (
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      );
    };

    const style = getComputedStyle(element);
    const placeholder = getComputedStyle(element, '::placeholder');
    return {
      background: style.backgroundColor,
      backgroundLuminance: luminance(background),
      color: style.color,
      colorScheme: style.colorScheme,
      placeholderColor: placeholder.color,
      placeholderContrast: contrast(parseColor(placeholder.color), background),
      textContrast: contrast(parseColor(style.color), background),
    };
  });
}

async function expectLightReadable(
  control: Locator,
  options: { placeholder?: boolean; focusRing?: boolean } = {}
) {
  await expect(control).toBeVisible();
  const readability = await controlReadability(control);
  expect(
    readability.backgroundLuminance,
    readability.background
  ).toBeGreaterThan(0.78);
  expect(readability.textContrast, readability.color).toBeGreaterThanOrEqual(
    4.5
  );
  if (options.placeholder) {
    expect(
      readability.placeholderContrast,
      readability.placeholderColor
    ).toBeGreaterThanOrEqual(4.5);
  }
  if (options.focusRing) {
    await control.focus();
    const boxShadow = await control.evaluate(
      (element) => getComputedStyle(element).boxShadow
    );
    expect(boxShadow).not.toBe('none');
  }
}

async function mockKnowledge(page: Page) {
  await page.route('**/api/v1/knowledge/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const release = {
      id: 'release-theme',
      version: 'v1.0.0',
      literatureCutoffAt: '2026-09-01T00:00:00.000Z',
      regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
      publishedAt: '2026-09-16T00:00:00.000Z',
    };
    const data = path.endsWith('/summary')
      ? {
          release,
          counts: {
            diseases: 2,
            genes: 2,
            variants: 5,
            drugs: 4,
            associations: 6,
            claims: 10,
            sources: 8,
          },
          recentReleases: [release],
        }
      : {
          release,
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope(data)),
    });
  });
}

test('public light forms stay readable when the system theme is dark', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await useSystemDark(page);

  await page.goto('/zh');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expectLightReadable(
    page.getByRole('combobox', { name: '癌种', exact: true }),
    { focusRing: true }
  );
  await expectLightReadable(
    page.getByRole('combobox', { name: '基因变异', exact: true }),
    { focusRing: true }
  );
  await expect(page.locator('.evidex-landing-page')).toHaveCSS(
    'color-scheme',
    'light'
  );

  await page.route(
    '**/api/v1/evidence-questions/theme-readable',
    async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          envelope({
            id: 'theme-readable',
            questionRunId: 'theme-readable',
            status: 'ANSWERED',
            progress: 'COMPLETED',
            pollAfterMs: null,
            question: 'EGFR L858R 有哪些已审核证据？',
            knowledgeRelease: { version: 'v1.0.0' },
            result: {
              status: 'ANSWERED',
              answer: { overallSummary: '已审核证据摘要。', groups: [] },
              resultGroups: [],
              disclaimer: '仅用于肿瘤知识学习与研究。',
            },
          })
        ),
      });
    }
  );
  await page.goto('/zh/ask?run=theme-readable');
  await expect(page.locator('.evidex-product')).toHaveCSS(
    'color-scheme',
    'light'
  );
  await expectLightReadable(
    page.getByRole('textbox', { name: '你的证据问题' }),
    {
      placeholder: true,
      focusRing: true,
    }
  );
  await page.getByRole('button', { name: '添加已知条件' }).click();
  for (const label of ['疾病', '基因', '变异', '药物']) {
    await expectLightReadable(
      page.getByRole('textbox', { name: label, exact: true }),
      {
        placeholder: true,
        focusRing: true,
      }
    );
  }
  await expectLightReadable(page.getByRole('textbox', { name: '补充说明' }), {
    focusRing: true,
  });

  await mockKnowledge(page);
  await page.goto('/zh/knowledge');
  await expectLightReadable(
    page.getByRole('searchbox', { name: '搜索知识库' }),
    {
      placeholder: true,
      focusRing: true,
    }
  );

  const directories = [
    ['diseases', '疾病'],
    ['genes', '基因'],
    ['variants', '变异'],
    ['drugs', '药物'],
  ] as const;
  for (const [route, label] of directories) {
    await page.goto(`/zh/knowledge/${route}`);
    await expectLightReadable(
      page.getByRole('searchbox', { name: `搜索${label}` }),
      { placeholder: true, focusRing: true }
    );
    for (const filterLabel of [
      '按疾病筛选',
      '按基因筛选',
      '按证据方向筛选',
      '按证据等级筛选',
    ]) {
      await expectLightReadable(page.getByLabel(filterLabel), {
        focusRing: true,
      });
    }
  }
});

test('the existing evidence form stays light while sign-in stays dark and readable', async ({
  page,
}) => {
  await useSystemDark(page);

  await page.goto('/zh/evidence');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expectLightReadable(
    page.getByRole('combobox', { name: '癌种', exact: true }),
    { focusRing: true }
  );
  await expectLightReadable(page.getByRole('textbox', { name: '基因' }));
  await expectLightReadable(page.getByRole('combobox', { name: '蛋白变异' }), {
    focusRing: true,
  });

  await page.goto('/zh/sign-in');
  const email = page.getByRole('textbox', { name: '邮箱' });
  await expect(email).toBeVisible();
  const loginReadability = await controlReadability(email);
  expect(loginReadability.backgroundLuminance).toBeLessThan(0.35);
  expect(loginReadability.textContrast).toBeGreaterThanOrEqual(4.5);
});
