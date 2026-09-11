import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/database/**/*.test.ts'],
    setupFiles: ['./tests/setup/node.ts'],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
