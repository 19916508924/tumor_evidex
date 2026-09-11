import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import robots from '@/app/robots';
import { describe, expect, it } from 'vitest';

import { envConfigs } from '@/config';
import adminEn from '@/config/locale/messages/en/admin/sidebar.json';
import chatEn from '@/config/locale/messages/en/ai/chat.json';
import adminZh from '@/config/locale/messages/zh/admin/sidebar.json';
import chatZh from '@/config/locale/messages/zh/ai/chat.json';

const workspaceRoot = resolve(import.meta.dirname, '../..');

function read(relativePath: string) {
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8');
}

describe('Evidex public product surface', () => {
  it('publishes a product-specific dynamic sitemap instead of template URLs', () => {
    expect(existsSync(resolve(workspaceRoot, 'src/app/sitemap.ts'))).toBe(true);
    expect(existsSync(resolve(workspaceRoot, 'public/sitemap.xml'))).toBe(
      false
    );
  });

  it('uses Evidex brand assets for browser and sharing metadata', () => {
    expect(envConfigs.app_logo).toBe('/imgs/evidex/mark.svg');
    expect(envConfigs.app_favicon).toBe('/imgs/evidex/mark.svg');
    expect(envConfigs.app_preview_image).toBe('/imgs/evidex/og-preview.png');
    expect(
      existsSync(resolve(workspaceRoot, 'public/imgs/evidex/mark.svg'))
    ).toBe(true);
    expect(
      existsSync(resolve(workspaceRoot, 'public/imgs/evidex/og-preview.png'))
    ).toBe(true);
    expect(read('src/app/layout.tsx')).not.toContain('/favicon.ico');
  });

  it('removes placeholder identity and unconfirmed links from internal chrome', () => {
    expect(adminEn.header.brand.title).toBe('Evidex');
    expect(adminZh.header.brand.title).toBe('Evidex');
    expect(chatEn.sidebar.header.brand.title).toContain('Evidex');
    expect(chatZh.sidebar.header.brand.title).toContain('Evidex');

    const internalChrome = JSON.stringify({ adminEn, adminZh, chatEn, chatZh });
    expect(internalChrome).not.toMatch(
      /ShipAny|YourAppName|your-domain|your-app-name/i
    );
  });

  it('keeps unreleased scaffold destinations out of search results', () => {
    const rules = robots().rules;
    const serializedRules = JSON.stringify(rules);

    expect(serializedRules).toContain('/pricing');
    expect(serializedRules).toContain('/showcases');
    expect(serializedRules).toContain('/blog');
    expect(serializedRules).toContain('/docs');
    expect(serializedRules).not.toContain('/privacy-policy');
    expect(serializedRules).not.toContain('/terms-of-service');
  });

  it.each([
    'content/pages/privacy-policy.mdx',
    'content/pages/privacy-policy.zh.mdx',
    'content/pages/terms-of-service.mdx',
    'content/pages/terms-of-service.zh.mdx',
  ])(
    'removes placeholder identity and unsupported commerce claims from %s',
    (file) => {
      const content = read(file);

      expect(content).toMatch(/Evidex/);
      expect(content).not.toMatch(
        /ShipAny|YourAppName|your-domain|NextJS boilerplate|AI SaaS startup|Pricing and Payments|价格和付款/i
      );
    }
  );
});
