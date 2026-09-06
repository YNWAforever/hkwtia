import {mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const STATE_DIR = ".playwright";
export const STATE_PATH = `${STATE_DIR}/preview-state.json`;
export const COOKIE_PATH = `${STATE_DIR}/preview-cookie.txt`;

// Pure planning step, unit-tested: validates the share url and names the outputs. Never returns
// the token — callers log `plan.origin` only.
export function previewSessionPlan(env) {
  const raw = env.VERCEL_SHARE_URL?.trim();
  if (!raw) throw new Error("VERCEL_SHARE_URL_REQUIRED");
  const url = new URL(raw);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
  }
  if (!url.searchParams.get("_vercel_share")) throw new Error("VERCEL_SHARE_URL_MISSING_TOKEN");
  return {origin: url.origin, statePath: STATE_PATH, cookiePath: COOKIE_PATH};
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
    const response = await page.goto(process.env.VERCEL_SHARE_URL, {waitUntil: "domcontentloaded"});
    if (!response || response.status() >= 400 || !page.url().startsWith(plan.origin)) {
      throw new Error("VERCEL_SHARE_URL_DID_NOT_AUTHENTICATE");
    }
    mkdirSync(STATE_DIR, {recursive: true});
    await context.storageState({path: plan.statePath});
    const jwt = (await context.cookies(plan.origin)).find((cookie) => cookie.name === "_vercel_jwt");
    if (!jwt) throw new Error("VERCEL_SESSION_COOKIE_MISSING");
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
    console.error(error instanceof Error ? error.message : "PREVIEW_SESSION_FAILED");
    process.exitCode = 1;
  });
}
