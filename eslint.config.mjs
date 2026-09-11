import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    '.source/**',
    '.open-next/**',
    '.wrangler/**',
    'out/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['test', 'it', 'describe'].flatMap((object) =>
          ['only', 'skip', 'todo'].map((property) => ({
            object,
            property,
            message: '提交的测试必须执行；不能通过跳过测试绕过质量检查。',
          }))
        ),
      ],
    },
  },
]);
