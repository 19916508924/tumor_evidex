import { spawn } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const command = process.argv[2];
if (!['build', 'start'].includes(command)) {
  throw new Error('Usage: node scripts/test-app.mjs <build|start>');
}

// Next.js loads local env files automatically. Refuse a secret-bearing checkout
// instead of accidentally testing against a developer or production database.
const envFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
];
if (envFiles.some((file) => existsSync(file))) {
  throw new Error(
    'Isolated E2E requires a clean checkout without .env / .env.local / .env.production*. Use a separate test worktree; never remove your development secrets to run tests. See docs/testing.md.'
  );
}

const env = {};
for (const key of [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'CI',
]) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  DATABASE_URL: '',
  DATABASE_PROVIDER: 'postgresql',
  HOSTNAME: 'localhost',
  PORT: '3100',
  AUTH_SECRET: 'evidex-test-only-secret-do-not-use-in-production',
  AUTH_URL: 'http://localhost:3100',
  EVIDEX_E2E_MODE: '1',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
  NEXT_PUBLIC_DEFAULT_LOCALE: 'en',
  NEXT_PUBLIC_LOCALE_DETECT_ENABLED: 'false',
});

const require = createRequire(import.meta.url);
if (command === 'start') {
  // Match the Docker runtime: Next standalone requires its public/static assets.
  if (!existsSync('.next/standalone/server.js')) {
    throw new Error(
      'Missing standalone test build. Run pnpm build:test first.'
    );
  }
  cpSync('public', '.next/standalone/public', { recursive: true });
  cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
}
const args =
  command === 'start'
    ? [resolve('.next/standalone/server.js')]
    : [require.resolve('next/dist/bin/next'), 'build'];
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
