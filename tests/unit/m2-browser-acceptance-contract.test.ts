import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("M2 authenticated browser release contract", () => {
  it("uses the real client-only Neon Auth boundary", () => {
    const source = read("lib/auth/client.ts");
    expect(source).toMatch(/^"use client";/);
    expect(source).toContain('from "@neondatabase/auth/next"');
    expect(source).toContain("createAuthClient()");
  });

  it("keeps credential-safe sign-in and storage state under ignored test results", () => {
    const source = read("tests/fixtures/m2-auth.ts");
    expect(source).toContain('page.request.post("/api/auth/sign-in/email"');
    expect(source).toContain("M2_TEST_STAFF_EMAIL");
    expect(source).toContain("M2_TEST_MEMBER_PASSWORD");
    expect(source).not.toMatch(/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(read(".gitignore")).toContain("test-results/");
  });

  it("declares the M2 release gate, exact requirements, and browser story", () => {
    const config = read("playwright.config.ts");
    expect(config).toContain("releaseGate: 'M2'");
    for (const name of [
      "DATABASE_URL_TEST",
      "NEON_AUTH_BASE_URL",
      "NEON_AUTH_COOKIE_SECRET",
      "M2_TEST_STAFF_EMAIL",
      "M2_TEST_STAFF_PASSWORD",
      "M2_TEST_MEMBER_EMAIL",
      "M2_TEST_MEMBER_PASSWORD",
    ]) expect(config).toContain(name);

    const spec = read("tests/e2e/m2-admin-crm.spec.ts");
    for (const evidence of ["M2 Risk 01", "Content-Type", "event_attended", "ARR", "/zh/admin", "404"])
      expect(spec).toContain(evidence);
  });

  it("documents credential names without populating values", () => {
    const env = read(".env.example");
    for (const name of [
      "M2_TEST_STAFF_EMAIL",
      "M2_TEST_STAFF_PASSWORD",
      "M2_TEST_MEMBER_EMAIL",
      "M2_TEST_MEMBER_PASSWORD",
    ]) expect(env).toContain(`${name}=`);
  });
});