import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');

function read(relativePath: string) {
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8');
}

describe('production deployment dependencies', () => {
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
});
