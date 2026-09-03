import {defineConfig, devices} from '@playwright/test';

import {M2_LIVE_ENV_NAMES, buildM2RuntimeEnvironment} from './tests/fixtures/m2-runtime-env';

const port = process.env.PLAYWRIGHT_PORT ?? '3000';
// Derive the default base URL from the port. These two used to default independently, so
// `PLAYWRIGHT_PORT=3100` started the managed server on 3100 while every navigation still went to
// localhost:3000 — and because `reuseExistingServer` accepts whatever answers there, an unrelated
// project holding 3000 on a developer machine made a plain run silently test the wrong app.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const liveAcceptanceRequires = [...M2_LIVE_ENV_NAMES];

export default defineConfig({
  testDir: './tests/e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{platform}{-projectName}{ext}',
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
          // `--webpack` is load-bearing: a Windows worktree junctions
          // node_modules, which Turbopack rejects. The command itself must stay
          // cross-platform, though — spelling it `.\node_modules\.bin\next.cmd`
          // meant the managed server could not start on Linux or macOS, so
          // `npm run test:e2e` was Windows-only. `npx --no-install` resolves the
          // same local binary on every platform without reaching the network.
          command: `npx --no-install next dev --webpack --hostname localhost -p ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: buildM2RuntimeEnvironment(process.env)
        }
      })
});
