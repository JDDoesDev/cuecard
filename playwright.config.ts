import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5199);
const baseURL = `http://localhost:${PORT}`;

/**
 * Browser end-to-end tests (Chromium only). Vitest unit tests live in src/**
 * and are excluded from this runner (and vice versa, see vitest.config.ts).
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',
  // Tests share one dev server and use BroadcastChannel/localStorage per
  // context; keep it serial to avoid dev-server contention on slow (WSL) disks.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL,
    // The PWA service worker must never cache app code during tests.
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    // Images added in tests go here, never into the project's public/assets
    env: { CUECARD_ASSETS_DIR: 'test-results/e2e-assets' },
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
