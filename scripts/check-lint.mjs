import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { ESLint } from 'eslint';

import { isKnownDiagnostic } from './lib/lint-baseline.mjs';

const root = process.cwd();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const baseline = JSON.parse(
  await readFile(
    new URL('../.quality/eslint-baseline.json', import.meta.url),
    'utf8'
  )
);
const eslint = new ESLint();
const results = await eslint.lintFiles(['.']);
const unexpected = [];
let inherited = 0;

for (const result of results) {
  if (!result.messages.length) continue;
  const path = relative(root, result.filePath).replaceAll('\\', '/');
  const sourceHash = hash(await readFile(result.filePath));
  const entry = baseline.files[path];
  const remaining = entry
    ? { ...entry, diagnostics: [...entry.diagnostics] }
    : undefined;
  const messages = result.messages.filter((message) => {
    const fingerprint = hash(
      JSON.stringify([
        message.ruleId,
        message.severity,
        message.line,
        message.column,
        message.message.replaceAll(root, '<root>'),
      ])
    );
    if (isKnownDiagnostic(remaining, sourceHash, fingerprint)) {
      inherited++;
      remaining.diagnostics.splice(
        remaining.diagnostics.indexOf(fingerprint),
        1
      );
      return false;
    }
    return true;
  });
  if (messages.length) unexpected.push({ ...result, messages });
}

console.log(
  `Legacy lint diagnostics: ${inherited}. These are acknowledged template debt, not fixed issues.`
);
if (unexpected.length) {
  const formatter = await eslint.loadFormatter('stylish');
  console.error(formatter.format(unexpected));
  console.error(
    'New diagnostics, or legacy diagnostics in edited source, must be fixed. Do not expand the baseline.'
  );
  process.exitCode = 1;
} else {
  console.log(
    'Lint gate passed: no new diagnostics; all inherited files match their original content hashes.'
  );
}
