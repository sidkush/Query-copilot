import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'src/chart-ir/__tests__/**/*.test.ts',
      'src/chart-ir/__tests__/**/*.test.tsx',
      'src/chart-ir/__tests__/**/**/*.test.ts',
      'src/chart-ir/__tests__/**/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/chart-ir/**/*.ts'],
      exclude: ['src/chart-ir/__tests__/**'],
    },
  },
});
