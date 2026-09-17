const ISOLATED_E2E_VALUES = {
  NODE_ENV: 'production',
  EVIDEX_E2E_MODE: '1',
  PORT: '3100',
  AUTH_URL: 'http://localhost:3100',
  AUTH_SECRET: 'evidex-test-only-secret-do-not-use-in-production',
  DATABASE_URL: '',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
} as const;

/**
 * Allows browser fixtures to exercise administrator pages only inside the
 * repository's credential-free localhost production build.
 */
export function isIsolatedE2ETestRuntime(
  environment: Record<string, string | undefined> = process.env
) {
  return Object.entries(ISOLATED_E2E_VALUES).every(
    ([key, value]) => environment[key] === value
  );
}
