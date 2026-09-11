import { describe, expect, it } from 'vitest';

import { isKnownDiagnostic } from '../../scripts/lib/lint-baseline.mjs';

describe('immutable legacy lint baseline', () => {
  const entry = { sourceHash: 'original', diagnostics: ['known'] };

  it('recognizes only the exact original source and diagnostic', () => {
    expect(isKnownDiagnostic(entry, 'original', 'known')).toBe(true);
  });

  it('rejects inherited problems after that source file is edited', () => {
    expect(isKnownDiagnostic(entry, 'changed', 'known')).toBe(false);
  });

  it('rejects newly detected issues even in an untouched file', () => {
    expect(isKnownDiagnostic(entry, 'original', 'new-rule')).toBe(false);
  });

  it('rejects problems in files absent from the baseline', () => {
    expect(isKnownDiagnostic(undefined, 'original', 'known')).toBe(false);
  });
});
