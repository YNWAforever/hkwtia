import {mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";

import {failureMessage, previewSessionPlan} from "../../scripts/vercel-preview-session.mjs";

const gitignore = readFileSync("./.gitignore", "utf8");
const playwrightConfig = readFileSync("./playwright.config.ts", "utf8");
const lighthouse = readFileSync("./lighthouserc.js", "utf8");
const script = readFileSync("./scripts/vercel-preview-session.mjs", "utf8");

// lighthouserc.js reads its environment at import time, so every case re-evaluates the module
// (resetModules drops Vitest's module cache; Vite rejects a variable specifier as a cache-bust).
async function loadLighthouse(env: Record<string, string | undefined>) {
  for (const name of ["LHCI_BASE_URL", "PLAYWRIGHT_BASE_URL", "LHCI_COOKIE_FILE"]) vi.stubEnv(name, env[name]);
  vi.resetModules();
  return import("../../lighthouserc.js");
}

function cookieFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), "lhci-cookie-")), "cookie.txt");
  writeFileSync(file, "_vercel_jwt=x\n");
  return file;
}

afterEach(() => vi.unstubAllEnvs());

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

  it("mirrors the m3 acceptance host rule: one label before .vercel.app, never the production alias", () => {
    // Same rule as tests/fixtures/m3-acceptance-safety.ts: the share link authenticates whatever
    // host it names, so the plan must reject production and look-alike nested hosts up front.
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://hkwtia.vercel.app/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_PRODUCTION_TARGET_FORBIDDEN");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://evil.hkwtia-x.vercel.app/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://hkwtia-x.vercel.app.example.com/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "https://-bad.vercel.app/?_vercel_share=t"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
    expect(() => previewSessionPlan({VERCEL_SHARE_URL: "not a url"})).toThrow("VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW");
  });

  it("writes only under the ignored .playwright directory and reports the origin, never the token", () => {
    const plan = previewSessionPlan({VERCEL_SHARE_URL: "  https://hkwtia-x.vercel.app/?_vercel_share=secret-token \n"});
    expect(plan.origin).toBe("https://hkwtia-x.vercel.app");
    // The trimmed value is what the browser navigates to; whitespace from a pasted link must not
    // reach Playwright, whose failure message would otherwise carry it.
    expect(plan.shareUrl).toBe("https://hkwtia-x.vercel.app/?_vercel_share=secret-token");
    expect(plan.statePath).toBe(".playwright/preview-state.json");
    expect(plan.cookiePath).toBe(".playwright/preview-cookie.txt");
    expect(gitignore).toMatch(/^\.playwright\/$/m);
    // Lighthouse writes lhr-*.json/.html to .lighthouseci/ before uploading; with a session cookie
    // those reports embed the Cookie header, so the directory must be ignored too.
    expect(gitignore).toMatch(/^\.lighthouseci\/$/m);
  });

  it("prints only its own error codes: a Playwright navigation failure embeds the share url", () => {
    for (const code of [
      "VERCEL_SHARE_URL_REQUIRED",
      "VERCEL_SHARE_URL_REQUIRES_HTTPS_VERCEL_PREVIEW",
      "VERCEL_SHARE_URL_PRODUCTION_TARGET_FORBIDDEN",
      "VERCEL_SHARE_URL_MISSING_TOKEN",
      "VERCEL_SHARE_URL_NAVIGATION_FAILED",
      "VERCEL_SHARE_URL_DID_NOT_AUTHENTICATE",
      "VERCEL_SESSION_COOKIE_MISSING"
    ]) expect(failureMessage(new Error(code))).toBe(code);
    const playwrightStyle = new Error('page.goto: net::ERR_FAILED at https://hkwtia-x.vercel.app/?_vercel_share=secret-token');
    expect(failureMessage(playwrightStyle)).toBe("PREVIEW_SESSION_FAILED");
    expect(failureMessage(new Error("VERCEL_SHARE_URL_REQUIRED: https://x.vercel.app/?_vercel_share=t"))).toBe("PREVIEW_SESSION_FAILED");
    expect(failureMessage("string")).toBe("PREVIEW_SESSION_FAILED");
    expect(failureMessage(undefined)).toBe("PREVIEW_SESSION_FAILED");
  });

  it("keeps the browser-only path credential-safe (source pins for what needs a browser to run)", () => {
    // I1: goto failures are rethrown under a fixed code; the cause is attached, never printed.
    expect(script).toContain('new Error("VERCEL_SHARE_URL_NAVIGATION_FAILED", {cause})');
    expect(script).toContain("page.goto(plan.shareUrl");
    expect(script).not.toContain("page.goto(process.env");
    expect(script).toContain("console.error(failureMessage(error))");
    expect(script).not.toMatch(/console\.(log|error)\(`[^`]*\$\{(raw|url|error)/);
    // M1: an exact origin comparison, not a prefix one (`https://hkwtia-x.vercel.app.evil.com`).
    expect(script).toContain("new URL(page.url()).origin === plan.origin");
    expect(script).not.toContain("startsWith(plan.origin)");
    // M2: the storage state is written by the script at 0o600 with the Preview origin's cookies
    // only, in Playwright's storageState shape — not via `context.storageState({path})`, which
    // writes world-readable and includes every origin the context touched.
    expect(script).not.toContain("storageState({path");
    expect(script).toContain("context.cookies(plan.origin)");
    expect(script).toContain("origins: []");
    expect(script.match(/mode: 0o600/g)).toHaveLength(2);
  });

  it("turns Playwright traces off whenever a Preview credential is present", () => {
    expect(playwrightConfig).toContain("storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined");
    // M5: a retry trace records request headers, so it would capture the `_vercel_jwt` cookie
    // exactly like the share-token path already avoided. Pinned verbatim here and in
    // tests/unit/m2-browser-acceptance-contract.test.ts.
    expect(playwrightConfig).toContain("trace: process.env.VERCEL_SHARE_TOKEN || process.env.PLAYWRIGHT_STORAGE_STATE ? 'off' : 'on-first-retry'");
    expect(lighthouse).toContain("process.env.LHCI_COOKIE_FILE");
    expect(lighthouse).toMatch(/startServerCommand: remote \? undefined : 'npm\.cmd run start'/);
  });

  describe("lighthouserc.js", () => {
    it("keeps the local defaults when no Preview cookie is configured", async () => {
      const {ci} = await loadLighthouse({});
      expect(ci.upload.target).toBe("temporary-public-storage");
      expect(ci.collect.startServerCommand).toBe("npm.cmd run start");
      expect(ci.collect.settings.extraHeaders).toBeUndefined();
    });

    it("never uploads a cookie-bearing report to public storage (C1)", async () => {
      // Lighthouse copies settings.extraHeaders into every report (lhr.configSettings), so a
      // cookie run must stay on the filesystem under the ignored .playwright/ directory.
      const {ci} = await loadLighthouse({LHCI_BASE_URL: "https://hkwtia-x.vercel.app", LHCI_COOKIE_FILE: cookieFile()});
      expect(ci.upload).toEqual({target: "filesystem", outputDir: ".playwright/lighthouse"});
      expect(ci.collect.settings.extraHeaders?.Cookie).toBe("_vercel_jwt=x");
      expect(ci.collect.startServerCommand).toBeUndefined();
    });

    it("attaches the cookie only to an https *.vercel.app Preview, never production (I2)", async () => {
      await expect(loadLighthouse({LHCI_BASE_URL: "http://hkwtia-x.vercel.app", LHCI_COOKIE_FILE: cookieFile()})).rejects.toThrow("LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW");
      await expect(loadLighthouse({LHCI_BASE_URL: "https://example.com", LHCI_COOKIE_FILE: cookieFile()})).rejects.toThrow("LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW");
      await expect(loadLighthouse({LHCI_BASE_URL: "https://evil.hkwtia-x.vercel.app", LHCI_COOKIE_FILE: cookieFile()})).rejects.toThrow("LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW");
      await expect(loadLighthouse({LHCI_COOKIE_FILE: cookieFile()})).rejects.toThrow("LHCI_COOKIE_REQUIRES_HTTPS_VERCEL_PREVIEW");
      await expect(loadLighthouse({LHCI_BASE_URL: "https://hkwtia.vercel.app", LHCI_COOKIE_FILE: cookieFile()})).rejects.toThrow("LHCI_COOKIE_PRODUCTION_TARGET_FORBIDDEN");
    });
  });
});
