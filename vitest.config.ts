import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    // Playwright browser tests are run by `pnpm test:e2e`, not vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
