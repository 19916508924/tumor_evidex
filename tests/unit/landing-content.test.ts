import { describe, expect, it } from 'vitest';

import commonEn from '@/config/locale/messages/en/common.json';
import landingEn from '@/config/locale/messages/en/landing.json';
import pageEn from '@/config/locale/messages/en/pages/index.json';
import commonZh from '@/config/locale/messages/zh/common.json';
import landingZh from '@/config/locale/messages/zh/landing.json';
import pageZh from '@/config/locale/messages/zh/pages/index.json';

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe('Evidex landing content contract', () => {
  it.each([
    ['en', landingEn, commonEn],
    ['zh', landingZh, commonZh],
  ])(
    'removes scaffold branding and unrelated navigation in %s',
    (locale, landing, common) => {
      expect(landing.header.brand.title).toBe('Evidex');
      expect(landing.header.show_sign).toBe(false);
      expect(landing.header.show_theme).toBe(false);
      expect(landing.header).not.toHaveProperty('topbanner');
      expect(landing.header.nav.items.map((item) => item.url)).toEqual([
        '/#value',
        '/#workflow',
        '/#evidence',
        '/#integration',
        '/#faq',
        `/${locale}/ops/reviews`,
      ]);
      expect(landing.header).not.toHaveProperty('menu_open_label');
      expect(landing.header).not.toHaveProperty('menu_close_label');
      expect(landing.header).not.toHaveProperty('mobile_nav_label');
      expect(landing.header.buttons).toEqual([
        expect.objectContaining({ url: '/#contact' }),
      ]);

      const visibleProductCopy = collectStrings({ landing, common }).join(' ');
      expect(visibleProductCopy).not.toMatch(
        /ShipAny|YourAppName|AI Image Generator|AI 图片生成器|Pricing|价格|Showcases|案例展示|999\+|your-app-name|your-domain/i
      );
      expect(common.metadata.title).toContain('Evidex');
    }
  );

  it('keeps the English and Chinese page structures aligned', () => {
    const expectedSections = [
      'hero',
      'pain',
      'value',
      'results',
      'workflow',
      'integration',
      'evidence',
      'trust',
      'roadmap',
      'faq',
      'contact',
    ];

    expect(Object.keys(pageEn.page.sections)).toEqual(expectedSections);
    expect(Object.keys(pageZh.page.sections)).toEqual(expectedSections);
    expect(pageEn.page.sections.hero.title).toBe(
      'See more of the patient. Match drugs and clinical trials with comprehensive evidence.'
    );
    expect(pageZh.page.sections.hero.title).toBe(
      '看见更多患者细节，用全面证据匹配药物与临床试验'
    );
  });

  it.each([
    ['en', pageEn],
    ['zh', pageZh],
  ])(
    'states the current product boundary and real release data in %s',
    (_, page) => {
      expect(page.page.sections.hero.primary_action.href).toBe('/zh/ask');
      expect(page.page.sections.integration.api.request).toEqual({
        disease: 'NSCLC',
        biomarkers: [
          {
            gene: 'EGFR',
            alterationType: 'SNV',
            hgvsp: 'p.L858R',
          },
        ],
        jurisdiction: 'US',
        locale: 'zh-CN',
      });
      expect(page.page.sections.trust.release).toBe('v0.2.0');
      expect(
        page.page.sections.trust.metrics.map((metric) => metric.value)
      ).toEqual(['2', '2', '5', '6', '20', '9', '22']);
      expect(page.page.sections.results.trials.status).toMatch(
        /Planned|规划中/
      );
      expect(page.page.sections.integration.api.status).toMatch(/Pilot|试点/);

      const visibleCopy = collectStrings(page).join(' ');
      expect(visibleCopy).not.toMatch(/—|–/u);
      expect(visibleCopy).not.toMatch(/ShipAny|YourAppName/i);
    }
  );
});
