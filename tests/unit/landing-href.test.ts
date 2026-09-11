import { describe, expect, it } from 'vitest';

import { localizedLandingHref } from '@/shared/lib/landing-href';

describe('localizedLandingHref', () => {
  it.each([
    ['/', 'zh', '/zh'],
    ['/#evidence', 'zh', '/zh#evidence'],
    ['/privacy-policy', 'zh', '/zh/privacy-policy'],
    ['/zh/evidence', 'zh', '/zh/evidence'],
    ['/zh#contact', 'zh', '/zh#contact'],
    ['/#evidence', 'en', '/#evidence'],
    ['/zh/evidence', 'en', '/zh/evidence'],
    ['https://example.com', 'zh', 'https://example.com'],
    ['mailto:team@example.com', 'zh', 'mailto:team@example.com'],
    ['#local', 'zh', '#local'],
    ['relative-path', 'zh', 'relative-path'],
  ])('maps %s for %s to %s', (href, locale, expected) => {
    expect(localizedLandingHref(href, locale)).toBe(expected);
  });
});
