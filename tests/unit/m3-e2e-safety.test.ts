import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it, vi} from "vitest";

import {
  enterProtectedM3Preview,
  requireM3E2ETarget,
} from "@/tests/fixtures/m3-acceptance-safety";

describe("M3 E2E target safety", () => {
  it("allows loopback targets without a remote allowlist", () => {
    for (const target of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ]) {
      expect(requireM3E2ETarget({
        PLAYWRIGHT_BASE_URL: target,
      })).toMatchObject({
        origin: target,
        isLoopback: true,
      });
    }
  });

  it("allows an HTTPS Vercel Preview only when its origin matches exactly", () => {
    const origin =
      "https://hkwtia-git-m3-acceptance-wtia.vercel.app";

    expect(requireM3E2ETarget({
      PLAYWRIGHT_BASE_URL: `${origin}/`,
      M3_E2E_ALLOWED_ORIGIN: origin,
    })).toEqual({
      baseUrl: origin,
      origin,
      isLoopback: false,
    });
  });

  it("rejects a remote target without an allowlist even when credentials exist", () => {
    expect(() => requireM3E2ETarget({
      PLAYWRIGHT_BASE_URL:
        "https://hkwtia-git-m3-acceptance-wtia.vercel.app",
      M3_TEST_STAFF_EMAIL: "staff@example.test",
      M3_TEST_STAFF_PASSWORD: "not-a-real-secret",
      VERCEL_SHARE_TOKEN: "not-a-real-token",
    })).toThrow("M3_E2E_ALLOWED_ORIGIN_REQUIRED");
  });

  it("rejects a mismatched remote allowlist", () => {
    expect(() => requireM3E2ETarget({
      PLAYWRIGHT_BASE_URL:
        "https://hkwtia-git-m3-acceptance-wtia.vercel.app",
      M3_E2E_ALLOWED_ORIGIN:
        "https://hkwtia-git-other-preview-wtia.vercel.app",
    })).toThrow("M3_E2E_TARGET_ORIGIN_MISMATCH");
  });

  it("rejects the production Vercel origin even when it is allowlisted", () => {
    expect(() => requireM3E2ETarget({
      PLAYWRIGHT_BASE_URL: "https://hkwtia.vercel.app",
      M3_E2E_ALLOWED_ORIGIN: "https://hkwtia.vercel.app",
    })).toThrow("M3_E2E_PRODUCTION_TARGET_FORBIDDEN");
  });

  it.each([
    [
      "remote HTTP",
      "http://hkwtia-git-m3-acceptance-wtia.vercel.app",
      "http://hkwtia-git-m3-acceptance-wtia.vercel.app",
    ],
    [
      "an arbitrary HTTPS host",
      "https://preview.example.test",
      "https://preview.example.test",
    ],
    [
      "a target carrying URL credentials",
      "https://user:password@hkwtia-git-m3-acceptance-wtia.vercel.app",
      "https://hkwtia-git-m3-acceptance-wtia.vercel.app",
    ],
  ])("rejects %s", (_case, target, allowedOrigin) => {
    expect(() => requireM3E2ETarget({
      PLAYWRIGHT_BASE_URL: target,
      M3_E2E_ALLOWED_ORIGIN: allowedOrigin,
    })).toThrow();
  });

  it("never attaches a share token or navigates for loopback", async () => {
    const goto = vi.fn(async (url: string) => url);
    const setExtraHTTPHeaders = vi.fn(async () => undefined);
    const page = {goto, setExtraHTTPHeaders};
    const environment = {
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
      VERCEL_SHARE_TOKEN: "test-only-share-token",
    };

    await enterProtectedM3Preview(page, environment);

    expect(goto).not.toHaveBeenCalled();
    expect(setExtraHTTPHeaders).not.toHaveBeenCalled();
    expect(environment.PLAYWRIGHT_BASE_URL).not.toContain(
      "_vercel_share",
    );
  });

  it("attaches a share token only to the exact allowed remote Preview", async () => {
    const origin =
      "https://hkwtia-git-m3-acceptance-wtia.vercel.app";
    const goto = vi.fn(async (url: string) => url);
    const setExtraHTTPHeaders = vi.fn(async () => undefined);
    const page = {goto, setExtraHTTPHeaders};

    await enterProtectedM3Preview(page, {
      PLAYWRIGHT_BASE_URL: origin,
      M3_E2E_ALLOWED_ORIGIN: origin,
      VERCEL_SHARE_TOKEN: "test-only-share-token",
    });

    expect(goto).toHaveBeenCalledOnce();
    expect(setExtraHTTPHeaders).not.toHaveBeenCalled();
    const navigated = new URL(goto.mock.calls[0]![0]);
    expect(navigated.origin).toBe(origin);
    expect(navigated.pathname).toBe("/");
    expect([...navigated.searchParams.keys()]).toEqual([
      "_vercel_share",
    ]);
    expect(navigated.searchParams.get("_vercel_share")).toBe(
      "test-only-share-token",
    );
  });

  it("guards the E2E module before share auth, credentials, or mutations", () => {
    const source = readFileSync(
      resolve(process.cwd(), "tests/e2e/m3-automations.spec.ts"),
      "utf8",
    );
    const guardCall = source.indexOf("requireM3E2ETarget(process.env)");
    const shareAuth = source.indexOf(
      "enterProtectedM3Preview(page, process.env)",
    );
    const credentials = source.indexOf("M3_TEST_STAFF_EMAIL");
    const unsubscribeToken = source.indexOf(
      "M3_TEST_UNSUBSCRIBE_TOKEN_EN",
    );
    const beforeEach = source.indexOf("test.beforeEach");

    expect(guardCall).toBeGreaterThanOrEqual(0);
    expect(guardCall).toBeLessThan(shareAuth);
    expect(guardCall).toBeLessThan(credentials);
    expect(guardCall).toBeLessThan(unsubscribeToken);
    expect(guardCall).toBeLessThan(beforeEach);

    const protectedPreview = source.slice(
      source.indexOf("async function enterProtectedPreview"),
      source.indexOf("async function signIn"),
    );
    expect(protectedPreview).not.toContain("M3_E2E_ALLOWED_ORIGIN");
  });
});
