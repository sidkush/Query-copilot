import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/chart-ir/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/chart-ir/**/*.ts'],
      exclude: ['src/chart-ir/__tests__/**'],
    },
  },
});
