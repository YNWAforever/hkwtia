import {mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const STATE_DIR = ".playwright";
export const STATE_PATH = `${STATE_DIR}/preview-state.json`;
export const COOKIE_PATH = `${STATE_DIR}/preview-cookie.txt`;

// Same host rule as tests/fixtures/m3-acceptance-safety.ts: exactly one label before
// `.vercel.app` (so `evil.hkwtia-x.vercel.app` is out), and the production alias is refused
// outright — the share link authenticates whatever host it names.
const VERCEL_PREVIEW_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const PRODUCTION_HOST = "hkwtia.vercel.app";

// Every message this script is allowed to print. Anything else (Playwright's `page.goto` errors
// embed the navigated URL, i.e. the share token) is reported as PREVIEW_SESSION_FAILED.
const ERROR_CODES = new Set([
  "VERCEL_SHARE_URL_REQUIRED",
  "VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW",
  "VERCEL_SHARE_URL_PRODUCTION_TARGET_FORBIDDEN",
  "VERCEL_SHARE_URL_MISSING_TOKEN",
  "VERCEL_SHARE_URL_NAVIGATION_FAILED",
  "VERCEL_SHARE_URL_DID_NOT_AUTHENTICATE",
  "VERCEL_SESSION_COOKIE_MISSING"
]);

export function failureMessage(error) {
  return error instanceof Error && ERROR_CODES.has(error.message) ? error.message : "PREVIEW_SESSION_FAILED";
}

// Pure planning step, unit-tested: validates the share url and names the outputs. Never returns
// the token in a loggable field — callers log `plan.origin` only; `plan.shareUrl` is the trimmed
// value the browser navigates to and must never reach a message.
export function previewSessionPlan(env) {
  const raw = env.VERCEL_SHARE_URL?.trim();
  if (!raw) throw new Error("VERCEL_SHARE_URL_REQUIRED");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
  }
  if (url.protocol !== "https:") throw new Error("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
  if (url.hostname === PRODUCTION_HOST) throw new Error("VERCEL_SHARE_URL_PRODUCTION_TARGET_FORBIDDEN");
  if (!VERCEL_PREVIEW_HOST.test(url.hostname)) throw new Error("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
  if (!url.searchParams.get("_vercel_share")) throw new Error("VERCEL_SHARE_URL_MISSING_TOKEN");
  return {origin: url.origin, shareUrl: raw, statePath: STATE_PATH, cookiePath: COOKIE_PATH};
}

async function main() {
  const plan = previewSessionPlan(process.env);
  // `playwright` (not only `@playwright/test`) is installed, so the browser API is imported directly.
  const {chromium} = await import("playwright");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Visiting the share url sets Vercel's `_vercel_jwt` cookie and redirects to the deployment.
    // Playwright's navigation errors quote the URL, so they are rethrown under a fixed code with
    // the original attached as `cause` (never printed).
    let response;
    try {
      response = await page.goto(plan.shareUrl, {waitUntil: "domcontentloaded"});
    } catch (cause) {
      throw new Error("VERCEL_SHARE_URL_NAVIGATION_FAILED", {cause});
    }
    // Exact origin match: a `startsWith` check would accept `https://hkwtia-x.vercel.app.evil.com`.
    const authenticated = Boolean(response) && response.status() < 400 && new URL(page.url()).origin === plan.origin;
    if (!authenticated) throw new Error("VERCEL_SHARE_URL_DID_NOT_AUTHENTICATE");
    // Only the Preview origin's cookies, in Playwright's storageState shape. `context.storageState
    // ({path})` would write every origin the context touched at the default (world-readable) mode.
    const cookies = await context.cookies(plan.origin);
    const jwt = cookies.find((cookie) => cookie.name === "_vercel_jwt");
    if (!jwt) throw new Error("VERCEL_SESSION_COOKIE_MISSING");
    mkdirSync(STATE_DIR, {recursive: true});
    writeFileSync(plan.statePath, `${JSON.stringify({cookies, origins: []}, null, 2)}\n`, {mode: 0o600});
    writeFileSync(plan.cookiePath, `_vercel_jwt=${jwt.value}\n`, {mode: 0o600});
    console.log(`preview session written for ${plan.origin} -> ${plan.statePath}, ${plan.cookiePath}`);
  } finally {
    await browser.close();
  }
}

// Same entrypoint check as scripts/seed-m5.ts: a plain `import.meta.url === file://…` comparison
// breaks on Windows (drive-letter case), so compare the resolved paths case-insensitively.
const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()) {
  main().catch((error) => {
    console.error(failureMessage(error));
    process.exitCode = 1;
  });
}
