import { expect, test } from '@playwright/test';

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
      name: 'Try the current demo',
      exact: true,
    })
    .first();
  await expect(currentDemo).toHaveAttribute('href', '/zh/evidence');
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
    page.getByRole('contentinfo').getByRole('link', { name: '当前版本' })
  ).toHaveAttribute('href', '/zh/evidence');
});

test('landing page API example copies and the mobile navigation returns focus', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3100',
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Copy API request' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const menuButton = page.getByRole('button', { name: 'Open navigation' });
  await menuButton.click();
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
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
