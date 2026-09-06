import {readFileSync} from 'node:fs';

const baseUrl = process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const remote = Boolean(process.env.LHCI_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL);
// WP-8: a protected Preview needs Vercel's session cookie; the file is written by
// scripts/vercel-preview-session.mjs under the ignored .playwright/ directory.
const cookieFile = process.env.LHCI_COOKIE_FILE;

if (cookieFile) {
  // The cookie is sent to whatever `baseUrl` names, so the target is checked before the cookie
  // is even read: an https Preview host under the same rule as
  // tests/fixtures/m3-acceptance-safety.ts (one label before `.vercel.app`), never the
  // production alias.
  let target;
  try {
    target = new URL(baseUrl);
  } catch {
    throw new Error('LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW');
  }
  if (target.protocol !== 'https:') throw new Error('LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW');
  if (target.hostname === 'hkwtia.vercel.app') throw new Error('LHCI_COOKIE_PRODUCTION_TARGET_FORBIDDEN');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(target.hostname)) {
    throw new Error('LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW');
  }
}
const cookie = cookieFile ? readFileSync(cookieFile, 'utf8').trim() : undefined;

const config = {
  ci: {
    collect: {
      // WP-8 row 8.3 names `/`, `/membership`, `/events`; `/programmes` and `/partners` are the
      // WP-7 surfaces, audited because they are new. Each in both locales.
      url: [
        `${baseUrl}/`, `${baseUrl}/zh`,
        `${baseUrl}/membership`, `${baseUrl}/zh/membership`,
        `${baseUrl}/events`, `${baseUrl}/zh/events`,
        `${baseUrl}/programmes`, `${baseUrl}/zh/programmes`,
        `${baseUrl}/partners`, `${baseUrl}/zh/partners`
      ],
      numberOfRuns: 1,
      // A remote base URL (a Preview) is already serving; lhci only starts a server when the
      // command is truthy, so `undefined` skips it while the ready pattern/timeout stay harmless.
      startServerCommand: remote ? undefined : 'npm.cmd run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 120_000,
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --disable-dev-shm-usage',
        // `extraHeaders` rides on every request the audited page makes, cross-origin included --
        // not just the navigation to `baseUrl`. Today the ten routes make no third-party requests
        // on a passive render, so the session cookie only ever reaches the Preview host; a future
        // third-party script/font/image on an audited route would widen where it is sent.
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
    // Lighthouse copies `settings.extraHeaders` into every report (`lhr.configSettings`), so a
    // cookie run's lhr-*.json/.html carry the `_vercel_jwt` session. Those must never reach
    // temporary-public-storage: they stay on disk under the ignored .playwright/ directory and are
    // deleted with the session. Only the cookie-less local run keeps the public upload.
    upload: cookie ? {target: 'filesystem', outputDir: '.playwright/lighthouse'} : {target: 'temporary-public-storage'}
  }
};

export const ci = config.ci;
export default config;
