import { describe, expect, it } from 'vitest';

import { isIsolatedE2ETestRuntime } from '@/shared/lib/e2e-test-mode';

const isolatedEnvironment = {
  NODE_ENV: 'production',
  EVIDEX_E2E_MODE: '1',
  PORT: '3100',
  AUTH_URL: 'http://localhost:3100',
  AUTH_SECRET: 'evidex-test-only-secret-do-not-use-in-production',
  DATABASE_URL: '',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
};

describe('isolated E2E runtime guard', () => {
  it('accepts only the dedicated secret-free localhost test runtime', () => {
    expect(isIsolatedE2ETestRuntime(isolatedEnvironment)).toBe(true);
  });

  it.each([
    ['missing explicit mode', { ...isolatedEnvironment, EVIDEX_E2E_MODE: '' }],
    ['development mode', { ...isolatedEnvironment, NODE_ENV: 'development' }],
    ['different port', { ...isolatedEnvironment, PORT: '3000' }],
    [
      'external auth URL',
      { ...isolatedEnvironment, AUTH_URL: 'https://evidex.example' },
    ],
    [
      'different auth secret',
      { ...isolatedEnvironment, AUTH_SECRET: 'real-secret' },
    ],
    [
      'configured database',
      { ...isolatedEnvironment, DATABASE_URL: 'postgresql://example' },
    ],
  ])('rejects %s', (_label, environment) => {
    expect(isIsolatedE2ETestRuntime(environment)).toBe(false);
  });
});
