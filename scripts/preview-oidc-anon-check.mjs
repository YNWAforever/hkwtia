// Read-only anonymous Preview smoke through Vercel Deployment Protection using the box's
// development OIDC token (Trusted Sources, same-project Preview). Never prints the token.
//
//   vercel env run -- node scripts/preview-oidc-anon-check.mjs https://<preview>.vercel.app
//
// The `x-vercel-trusted-oidc-idp-token` header is attached ONLY to requests whose origin equals the
// Preview origin, per redirect hop (third-party requests such as fonts/Stripe/OAuth never see it).
// Production alias refused. For Playwright specs use tests/fixtures/preview-oidc.ts instead.
import {chromium} from "@playwright/test";

const VERCEL_PREVIEW_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const PRODUCTION_HOST = "hkwtia.vercel.app";
const PATHS = ["/", "/membership", "/zh/membership"];

const target = new URL(process.argv[2] ?? "");
if (target.protocol !== "https:" || !VERCEL_PREVIEW_HOST.test(target.hostname)) throw new Error("PREVIEW_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
if (target.hostname === PRODUCTION_HOST) throw new Error("PRODUCTION_TARGET_FORBIDDEN");
const token = process.env.VERCEL_OIDC_TOKEN;
if (!token) throw new Error("VERCEL_OIDC_TOKEN_MISSING (run via `vercel env run --`)");
const origin = target.origin;

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  // CDP Fetch, not `context.route`: Playwright's `route.continue({headers})` re-applies headers to
  // every redirect hop (an off-origin 302 would carry the token), while CDP pauses each hop
  // separately and only for the Preview-origin pattern. Same mechanism as tests/fixtures/preview-oidc.ts.
  const session = await context.newCDPSession(page);
  session.on("Fetch.requestPaused", (event) => {
    const headers = Object.entries(event.request.headers)
      .filter(([name]) => name.toLowerCase() !== "x-vercel-trusted-oidc-idp-token")
      .map(([name, value]) => ({name, value}));
    if (new URL(event.request.url).origin === origin) headers.push({name: "x-vercel-trusted-oidc-idp-token", value: token});
    session.send("Fetch.continueRequest", {requestId: event.requestId, headers}).catch(() => undefined);
  });
  await session.send("Fetch.enable", {patterns: [{urlPattern: `${origin}/*`, requestStage: "Request"}]});
  const results = [];
  for (const path of PATHS) {
    const response = await page.goto(origin + path, {waitUntil: "domcontentloaded"});
    const landed = new URL(page.url());
    results.push({
      path,
      status: response?.status(),
      landed: landed.origin === origin ? landed.pathname : `OFF_ORIGIN:${landed.hostname}`,
      h1: (await page.locator("h1").first().innerText().catch(() => "")).slice(0, 80),
      planCards: await page.locator(".plan-grid article").evaluateAll((cards) => cards.map((card) => card.id)),
    });
  }
  console.log(JSON.stringify({origin, results}, null, 2));
  const ok = results.every((r) => r.status === 200 && !r.landed.startsWith("OFF_ORIGIN"));
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
