import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const port = process.env.PLAYWRIGHT_PORT ?? '3000';

export default defineConfig({
  testDir: './tests/e2e',
  metadata: {
    releaseGate: 'M1',
    liveAcceptanceRequires: 'DATABASE_URL_TEST and STRIPE_TEST_SECRET_KEY'
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: `.\\node_modules\\.bin\\next.cmd dev --hostname localhost -p ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      })
});
