import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = {
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
};

export default defineConfig({
  test: {
    passWithNoTests: false,
    allowOnly: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      // Initial protected modules. Add new/changed business modules here.
      // These thresholds describe this explicit scope, not the whole template.
      include: [
        'src/shared/lib/rate-limit.ts',
        'src/shared/lib/resp.ts',
        'src/shared/lib/landing-href.ts',
        'src/shared/components/ui/button.tsx',
        'src/shared/components/evidence/evidence-explorer.tsx',
        'src/shared/components/landing/landing-api-copy.tsx',
        'src/shared/components/landing/landing-evidence-demo.tsx',
        'src/app/api/user/get-user-info/route.ts',
        'src/app/api/v1/evidence-answer/route.ts',
        'src/extensions/ai/evidence-answer.ts',
        'src/shared/services/evidence/answer-evidence-query.ts',
        'src/shared/services/evidence/build-evidence-pack.ts',
        'src/shared/services/evidence/grade-association.ts',
        'src/shared/services/evidence/knowledge-package.ts',
        'src/shared/services/evidence/normalize-query.ts',
        'src/shared/services/evidence/validate-answer.ts',
        'scripts/lib/test-policy.mjs',
        'scripts/lib/lint-baseline.mjs',
      ],
      thresholds: {
        perFile: true,
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
    projects: [
      {
        resolve,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
          ],
          setupFiles: ['./tests/setup/node.ts'],
          clearMocks: true,
          restoreMocks: true,
        },
      },
      {
        resolve,
        esbuild: { jsx: 'automatic' },
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['./tests/setup/dom.ts'],
          clearMocks: true,
          restoreMocks: true,
        },
      },
    ],
  },
});
