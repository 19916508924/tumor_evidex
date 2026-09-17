import sitemap from '@/app/sitemap';
import { describe, expect, it } from 'vitest';

describe('Evidex public product sitemap', () => {
  it('publishes the evidence question and knowledge entry points', () => {
    const paths = sitemap().map(({ url }) => new URL(url).pathname);

    expect(paths).toContain('/zh/ask');
    expect(paths).toContain('/zh/knowledge');
  });
});
