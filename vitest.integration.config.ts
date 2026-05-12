import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/integration/**/*.integration.ts'],
    environment: 'node',
    clearMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
