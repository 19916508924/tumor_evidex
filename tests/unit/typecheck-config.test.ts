import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('includes generated Next.js route validators in the TypeScript program', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evidex-types-'));
  try {
    mkdirSync(join(directory, '.next/types'), { recursive: true });
    const validator = join(directory, '.next/types/validator.ts');
    writeFileSync(validator, 'export {};');
    const config = JSON.parse(
      readFileSync(new URL('../../tsconfig.json', import.meta.url), 'utf8')
    );
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, directory);
    expect(parsed.fileNames).toContain(validator);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
