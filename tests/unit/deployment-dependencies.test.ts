import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');

function read(relativePath: string) {
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8');
}

describe('production deployment dependencies', () => {
  it('offers one local command that starts both the web app and durable worker', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['dev:full']).toBe('node scripts/dev-full.mjs');
  });

  it('does not install the Vercel-blocked next-mdx-remote v5 release', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
    };
    const declaredVersion = packageJson.dependencies['next-mdx-remote'];
    const declaredMajor = Number(declaredVersion.match(/\d+/)?.[0]);
    const lockfile = read('pnpm-lock.yaml');

    expect(declaredMajor).toBeGreaterThanOrEqual(6);
    expect(lockfile).toMatch(/next-mdx-remote@6\./);
    expect(lockfile).not.toMatch(/next-mdx-remote@5\./);
  });

  it('ships an explicit long-running worker image without using Vercel cron', () => {
    const dockerfile = read('Dockerfile');
    const vercel = JSON.parse(read('vercel.json')) as { crons?: unknown[] };

    expect(dockerfile).toMatch(/FROM deps AS worker/);
    expect(dockerfile).toContain('scripts/evidex-worker.ts');
    expect(dockerfile).toMatch(/CMD \["pnpm",\s*"exec",\s*"tsx"/);
    expect(dockerfile).toMatch(/FROM base AS runner/);
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
    expect(vercel.crons).toEqual([]);
  });
});
