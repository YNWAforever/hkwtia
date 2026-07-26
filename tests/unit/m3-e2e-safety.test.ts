import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {requireM3E2ETarget} from "@/tests/fixtures/m3-acceptance-safety";

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

  it("guards the E2E module before share auth, credentials, or mutations", () => {
    const source = readFileSync(
      resolve(process.cwd(), "tests/e2e/m3-automations.spec.ts"),
      "utf8",
    );
    const guardCall = source.indexOf("requireM3E2ETarget(process.env)");
    const shareAuth = source.indexOf("VERCEL_SHARE_TOKEN");
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
