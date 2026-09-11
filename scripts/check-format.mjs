import { readFile } from 'node:fs/promises';
import * as prettier from 'prettier';

import { getChanges } from './lib/changed-files.mjs';

const files = [
  ...new Set(
    getChanges()
      .filter(({ status }) => status !== 'D')
      .map(({ path }) => path)
  ),
];
let checked = 0;
for (const filepath of files) {
  const info = await prettier.getFileInfo(filepath, {
    ignorePath: '.prettierignore',
  });
  if (info.ignored || !info.inferredParser) continue;
  checked++;
  const options = (await prettier.resolveConfig(filepath)) ?? {};
  if (
    !(await prettier.check(await readFile(filepath, 'utf8'), {
      ...options,
      filepath,
    }))
  ) {
    console.error(`Formatting required: ${filepath}`);
    process.exitCode = 1;
  }
}
console.log(`Checked formatting of ${checked} changed files.`);
