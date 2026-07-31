import {describe, expect, it} from "vitest";

import {validateM4BE2ETarget} from "@/tests/fixtures/m4b-e2e-safety";

describe("M4B browser target safety", () => {
  const preview = "https://hkwtia-git-m4b-isolated-team.vercel.app";

  it("requires an exact explicit origin for loopback too", () => {
    expect(() => validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
    })).toThrow("M4B_E2E_ALLOWED_ORIGIN_REQUIRED");
    expect(validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
      M4B_E2E_ALLOWED_ORIGIN: "http://localhost:3000",
    }).origin).toBe("http://localhost:3000");
  });

  it("requires exact allowed-origin equality", () => {
    expect(() => validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: preview,
      M4B_E2E_ALLOWED_ORIGIN: "https://another-preview.vercel.app",
      VERCEL_ENV: "preview",
    })).toThrow("M4B_E2E_TARGET_ORIGIN_MISMATCH");
  });

  it("requires Preview evidence for remote Vercel targets", () => {
    expect(() => validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: preview,
      M4B_E2E_ALLOWED_ORIGIN: preview,
    })).toThrow("M4B_E2E_PREVIEW_EVIDENCE_REQUIRED");
    expect(validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: preview,
      M4B_E2E_ALLOWED_ORIGIN: preview,
      VERCEL_ENV: "preview",
    }).origin).toBe(preview);
    expect(validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: preview,
      M4B_E2E_ALLOWED_ORIGIN: preview,
      M4B_E2E_PREVIEW_ONLY: "true",
    }).origin).toBe(preview);
  });

  it.each([
    "https://hkwtia.vercel.app",
    "https://hkwtia-git-main-team.vercel.app",
    "https://hkwtia-production-team.vercel.app",
  ])("rejects Production Vercel URL or alias %s", (productionTarget) => {
    expect(() => validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: productionTarget,
      M4B_E2E_ALLOWED_ORIGIN: productionTarget,
      VERCEL_ENV: "preview",
      M4B_E2E_PREVIEW_ONLY: "true",
    })).toThrow("M4B_E2E_PRODUCTION_FORBIDDEN");
  });

  it("rejects non-Vercel remote origins", () => {
    expect(() => validateM4BE2ETarget({
      PLAYWRIGHT_BASE_URL: "https://preview.example.com",
      M4B_E2E_ALLOWED_ORIGIN: "https://preview.example.com",
      M4B_E2E_PREVIEW_ONLY: "true",
    })).toThrow("M4B_E2E_PREVIEW_TARGET_REQUIRED");
  });
});
