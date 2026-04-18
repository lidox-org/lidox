import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '/tmp/lidox-playwright-test-results',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'corepack npm --workspace @lidox/types run build && corepack npm --workspace @lidox/web run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
