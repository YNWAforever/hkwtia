import {readFileSync} from 'node:fs';

const baseUrl = process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const remote = Boolean(process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL);
// WP-8: a protected Preview needs Vercel's session cookie; the file is written by
// scripts/vercel-preview-session.mjs under the ignored .playwright/ directory.
const cookie = process.env.LHCI_COOKIE_FILE ? readFileSync(process.env.LHCI_COOKIE_FILE, 'utf8').trim() : undefined;

const config = {
  ci: {
    collect: {
      url: [`${baseUrl}/`, `${baseUrl}/zh`, `${baseUrl}/membership`, `${baseUrl}/zh/membership`],
      numberOfRuns: 1,
      // A remote base URL (a Preview) is already serving; lhci only starts a server when the
      // command is truthy, so `undefined` skips it while the ready pattern/timeout stay harmless.
      startServerCommand: remote ? undefined : 'npm.cmd run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 120_000,
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --disable-dev-shm-usage',
        ...(cookie ? {extraHeaders: {Cookie: cookie}} : {})
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', {minScore: 0.9}],
        'categories:accessibility': ['error', {minScore: 0.95}],
        'categories:seo': ['error', {minScore: 0.95}]
      }
    },
    upload: {target: 'temporary-public-storage'}
  }
};

export const ci = config.ci;
export default config;
