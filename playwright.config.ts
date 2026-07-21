import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const port = process.env.PLAYWRIGHT_PORT ?? '3000';
const liveAcceptanceRequires = [
  'DATABASE_URL_TEST',
  'NEON_AUTH_BASE_URL',
  'NEON_AUTH_COOKIE_SECRET',
  'M2_TEST_STAFF_EMAIL',
  'M2_TEST_STAFF_PASSWORD',
  'M2_TEST_MEMBER_EMAIL',
  'M2_TEST_MEMBER_PASSWORD'
];

export default defineConfig({
  testDir: './tests/e2e',
  metadata: {
    releaseGate: 'M2',
    liveAcceptanceRequires
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
          timeout: 120_000,
          env: {...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST ?? ''}
        }
      })
});
