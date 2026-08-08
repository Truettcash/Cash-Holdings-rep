import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: 'src/setupTests.ts',
    exclude: ['tests/e2e/**', 'node_modules/**'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
