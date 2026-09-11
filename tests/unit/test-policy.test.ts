import { describe, expect, it } from 'vitest';

import { evaluateTestPolicy } from '../../scripts/lib/test-policy.mjs';

describe('source change test policy', () => {
  it('rejects a source change without an executable test change', () => {
    expect(
      evaluateTestPolicy([{ status: 'M', path: 'src/app/page.tsx' }])
    ).toMatchObject({ ok: false });
  });

  it('accepts a source change accompanied by a test', () => {
    expect(
      evaluateTestPolicy([
        { status: 'M', path: 'src/app/page.tsx' },
        { status: 'A', path: 'tests/e2e/home.spec.ts' },
      ])
    ).toMatchObject({ ok: true });
  });

  it('does not treat a deleted test, fixture or prose as a new regression test', () => {
    expect(
      evaluateTestPolicy([
        { status: 'A', path: 'src/shared/lib/example.ts' },
        { status: 'D', path: 'tests/unit/old.test.ts' },
        { status: 'M', path: 'tests/README.md' },
        { status: 'A', path: 'tests/fixtures/example.ts' },
      ])
    ).toMatchObject({ ok: false });
  });

  it('requires regression evidence for deleted source too', () => {
    expect(
      evaluateTestPolicy([{ status: 'D', path: 'src/app/route.ts' }])
    ).toMatchObject({ ok: false });
  });

  it('allows documentation-only changes', () => {
    expect(
      evaluateTestPolicy([{ status: 'M', path: 'README.md' }])
    ).toMatchObject({ ok: true });
  });
});
