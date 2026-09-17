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
    // Neon is in us-east-2 while local development may be cross-region.
    // Keep business assertions strict but allow remote DDL/read round trips.
    testTimeout: 120_000,
  },
});
