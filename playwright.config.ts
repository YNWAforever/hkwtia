import {defineConfig, devices} from '@playwright/test';

import {M2_LIVE_ENV_NAMES, buildM2RuntimeEnvironment} from './tests/fixtures/m2-runtime-env';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const port = process.env.PLAYWRIGHT_PORT ?? '3000';
const liveAcceptanceRequires = [...M2_LIVE_ENV_NAMES];

export default defineConfig({
  testDir: './tests/e2e',
  metadata: {
    releaseGate: 'M2',
    liveAcceptanceRequires
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  expect: {timeout: 20_000},
  timeout: 180_000,
  workers: 1,
  use: {
    baseURL,
    trace: process.env.VERCEL_SHARE_TOKEN ? 'off' : 'on-first-retry'
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: `.\\node_modules\\.bin\\next.cmd dev --webpack --hostname localhost -p ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: buildM2RuntimeEnvironment(process.env)
        }
      })
});
