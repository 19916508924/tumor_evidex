import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getChanges } from '../../scripts/lib/changed-files.mjs';

const originalCwd = process.cwd();
let directory: string;
const git = (...args: string[]) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

describe('reviewed Git change range', () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'evidex-diff-'));
    process.chdir(directory);
    git('init', '-q');
    writeFileSync('tracked.ts', 'original');
    writeFileSync('deleted.ts', 'original');
    git('add', '.');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'baseline'
    );
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    vi.stubEnv('QUALITY_BASE', '');
    vi.stubEnv('CI', '');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('includes staged, unstaged, deleted and untracked files, including spaces', () => {
    writeFileSync('tracked.ts', 'modified');
    git('add', 'tracked.ts');
    unlinkSync('deleted.ts');
    writeFileSync('new test.ts', 'new');
    expect(getChanges()).toEqual(
      expect.arrayContaining([
        { status: 'M', path: 'tracked.ts' },
        { status: 'D', path: 'deleted.ts' },
        { status: 'A', path: 'new test.ts' },
      ])
    );
  });

  it('includes committed branch changes instead of silently checking a clean worktree', () => {
    writeFileSync('tracked.ts', 'branch change');
    git('add', '.');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'branch'
    );
    expect(getChanges()).toContainEqual({ status: 'M', path: 'tracked.ts' });
  });

  it('fails closed when CI has no base', () => {
    vi.stubEnv('CI', 'true');
    expect(() => getChanges()).toThrow('CI requires QUALITY_BASE');
  });

  it('accepts an explicit base tree for the first push', () => {
    vi.stubEnv('CI', 'true');
    const emptyTree = execFileSync(
      'git',
      ['hash-object', '-w', '-t', 'tree', '--stdin'],
      { input: '', encoding: 'utf8' }
    ).trim();
    vi.stubEnv('QUALITY_BASE', emptyTree);
    expect(getChanges()).toContainEqual({ status: 'A', path: 'tracked.ts' });
  });
});
