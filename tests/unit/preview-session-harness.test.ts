import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {previewSessionPlan} from "../../scripts/vercel-preview-session.mjs";

const gitignore = readFileSync("./.gitignore", "utf8");
const playwrightConfig = readFileSync("./playwright.config.ts", "utf8");
const lighthouse = readFileSync("./lighthouserc.js", "utf8");

// WP-8: a Vercel-protected Preview is reached through a share URL that becomes a browser
// storage state and a Lighthouse cookie header — both written under an ignored directory,
// never printed, never committed (delivery gates: "record outcomes without copying credentials").
describe("preview session harness", () => {
  it("refuses to run without a share url, and refuses non-vercel or non-https hosts", () => {
    expect(() => previewSessionPlan({})).toThrow("VERCEL_SHARE_URL_REQUIRED");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "http://hkwtia-x.vercel.app/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://example.com/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://hkwtia-x.vercel.app/"})).toThrow("VERCEL_SHARE_URL_MISSING_TOKEN");
  });

  it("writes only under the ignored .playwright directory and reports the origin, never the token", () => {
    const plan = previewSessionPlan({VERCEL_SHARE_URL: "https://hkwtia-x.vercel.app/?_vercel_share=secret-token"});
    expect(plan.origin).toBe("https://hkwtia-x.vercel.app");
    expect(plan.statePath).toBe(".playwright/preview-state.json");
    expect(plan.cookiePath).toBe(".playwright/preview-cookie.txt");
    expect(JSON.stringify(plan)).not.toContain("secret-token");
    expect(gitignore).toMatch(/^\.playwright\/$/m);
  });

  it("lets Playwright and Lighthouse consume the session without changing their defaults", () => {
    expect(playwrightConfig).toContain("storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined");
    expect(playwrightConfig).toContain("process.env.VERCEL_SHARE_TOKEN ? 'off' : 'on-first-retry'");
    expect(lighthouse).toContain("process.env.LHCI_COOKIE_FILE");
    expect(lighthouse).toMatch(/startServerCommand: remote \? undefined : 'npm\.cmd run start'/);
  });
});
