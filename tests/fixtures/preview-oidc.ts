import {test as base, type BrowserContext, type Page} from '@playwright/test';

// Opt-in Playwright entry to a Vercel-protected PR Preview through Deployment Protection's
// Trusted Sources path: the box's development `VERCEL_OIDC_TOKEN` (from `vercel env run --`) is
// sent as `x-vercel-trusted-oidc-idp-token`. Same rules as scripts/preview-oidc-anon-check.mjs:
//   - HTTPS `<one-label>.vercel.app` Preview hosts only; the production alias is refused.
//   - The header rides ONLY on requests whose origin equals the Preview origin.
//   - The token is never logged, never put in an error message, never written to disk.
// Unset (`PLAYWRIGHT_PREVIEW_OIDC` != "true") the fixture is a no-op, so local runs are unchanged.

export const PREVIEW_OIDC_HEADER = 'x-vercel-trusted-oidc-idp-token';
const VERCEL_PREVIEW_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const PRODUCTION_HOST = 'hkwtia.vercel.app';

type Env = Readonly<Record<string, string | undefined>>;
export type PreviewOidcPlan = {origin: string; token: string} | null;

// Pure, unit-tested. Returns null when not opted in; throws fixed codes (never the token).
export function previewOidcPlan(env: Env): PreviewOidcPlan {
  if (env.PLAYWRIGHT_PREVIEW_OIDC !== 'true') return null;
  const raw = env.PLAYWRIGHT_BASE_URL?.trim();
  if (!raw) throw new Error('PREVIEW_OIDC_BASE_URL_REQUIRED');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW');
  }
  if (url.hostname === PRODUCTION_HOST) throw new Error('PREVIEW_OIDC_PRODUCTION_TARGET_FORBIDDEN');
  if (url.protocol !== 'https:' || !VERCEL_PREVIEW_HOST.test(url.hostname) || url.username || url.password) {
    throw new Error('PREVIEW_OIDC_REQUIRES_HTTPS_VERCEL_PREVIEW');
  }
  const token = env.VERCEL_OIDC_TOKEN?.trim();
  if (!token) throw new Error('PREVIEW_OIDC_TOKEN_MISSING');
  return {origin: url.origin, token};
}

export function isPreviewOrigin(requestUrl: string, origin: string): boolean {
  try {
    return new URL(requestUrl).origin === origin;
  } catch {
    return false;
  }
}

// Why CDP and not `context.route`: Playwright routes only the first hop of a redirect chain.
// `route.continue({headers})` re-applies the header to every later hop, so a Preview 302 to
// accounts.google.com (Auth) or checkout.stripe.com would carry the token; `route.fetch` +
// `fulfill` drops it on same-origin hops (`/en` -> `/` then bounces to SSO). Chromium's Fetch
// domain pauses each redirect hop as its own request, and its header override "does not extend to
// subsequent redirect hops" — so with the pattern scoped to the Preview origin, exactly the Preview
// hops get the header and nothing else is even paused. Chromium-only (the sole project here).
type CdpHeader = {name: string; value: string};
type RequestPaused = {requestId: string; request: {url: string; headers: Record<string, string>}};

async function attach(page: Page, plan: NonNullable<PreviewOidcPlan>): Promise<void> {
  const session = await page.context().newCDPSession(page);
  session.on('Fetch.requestPaused', (event: RequestPaused) => {
    const headers: CdpHeader[] = Object.entries(event.request.headers)
      .filter(([name]) => name.toLowerCase() !== PREVIEW_OIDC_HEADER)
      .map(([name, value]) => ({name, value}));
    // Belt-and-braces: the pattern already limits pausing to the Preview origin.
    if (isPreviewOrigin(event.request.url, plan.origin)) headers.push({name: PREVIEW_OIDC_HEADER, value: plan.token});
    // Errors from a closed page are expected at teardown; never surface CDP payloads (they hold headers).
    session.send('Fetch.continueRequest', {requestId: event.requestId, headers}).catch(() => undefined);
  });
  await session.send('Fetch.enable', {patterns: [{urlPattern: `${plan.origin}/*`, requestStage: 'Request'}]});
}

export async function routePreviewOidc(context: BrowserContext, plan: NonNullable<PreviewOidcPlan>): Promise<void> {
  // Pages (incl. popups such as an OAuth window) opened later attach on creation. The fixture's
  // `page` awaits `previewOidcReady`; a spec opening its own page should await it before `goto`.
  const track = (page: Page) => {
    const ready = attach(page, plan);
    attached.set(page, ready);
    return ready;
  };
  context.on('page', (page) => void track(page).catch(() => undefined));
  await Promise.all(context.pages().map(track));
}

const attached = new WeakMap<Page, Promise<void>>();

// Resolves once the page's Preview header injection is live (immediately if not installed).
export async function previewOidcReady(page: Page): Promise<void> {
  await attached.get(page);
}

export async function installPreviewOidc(context: BrowserContext, env: Env = process.env): Promise<boolean> {
  const plan = previewOidcPlan(env);
  if (!plan) return false;
  await routePreviewOidc(context, plan);
  return true;
}

// Drop-in `test` for Preview specs: identical to @playwright/test when not opted in.
export const test = base.extend<{previewOidc: boolean}>({
  previewOidc: [
    async ({context}, provide) => {
      await provide(await installPreviewOidc(context));
    },
    {auto: true},
  ],
  page: async ({page, previewOidc}, provide) => {
    if (previewOidc) await previewOidcReady(page);
    await provide(page);
  },
});
export {expect} from '@playwright/test';
