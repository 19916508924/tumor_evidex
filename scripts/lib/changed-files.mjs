import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
}

// CI supplies the PR merge-base or push-before SHA. Local runs include
// committed branch changes, staged/unstaged edits and untracked files.
export function getChanges() {
  const base = process.env.QUALITY_BASE;
  let reference = 'HEAD';
  if (base) {
    // Fail closed on a missing/invalid explicit base; never silently skip CI.
    reference = git(['rev-parse', '--verify', `${base}^{tree}`]);
  } else if (!process.env.CI) {
    try {
      const main = git(['rev-parse', '--verify', 'origin/main^{commit}']);
      reference = git(['merge-base', main, 'HEAD']);
    } catch {
      // A new offline checkout still checks every local edit against HEAD.
    }
  } else {
    throw new Error('CI requires QUALITY_BASE to determine the reviewed diff.');
  }
  const fields = git([
    'diff',
    '--no-renames',
    '--name-status',
    '-z',
    reference,
    '--',
  ]).split('\0');
  const changes = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    changes.push({ status: fields[i], path: fields[i + 1] });
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean);
  return [...changes, ...untracked.map((path) => ({ status: 'A', path }))];
}
