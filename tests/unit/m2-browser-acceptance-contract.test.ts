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
    const runtime = read("tests/fixtures/m2-runtime-env.ts");
    expect(source).toContain('page.request.post("/api/auth/sign-in/email"');
    expect(source).toContain('await page.goto("/")');
    expect(source).toContain("headers: {Origin: new URL(page.url()).origin}");
    expect(source).toContain("M2_TEST_STAFF");
    expect(source).toContain("M2_TEST_MEMBER");
    expect(runtime).toContain("M2_TEST_STAFF_EMAIL");
    expect(runtime).toContain("M2_TEST_MEMBER_PASSWORD");
    expect(source).not.toMatch(/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(read(".gitignore")).toContain("test-results/");
  });

  it("declares the M2 release gate, exact centralized requirements, and browser story", () => {
    const config = read("playwright.config.ts");
    const runtime = read("tests/fixtures/m2-runtime-env.ts");
    expect(config).toContain("releaseGate: 'M2'");
    expect(config).toContain("M2_LIVE_ENV_NAMES");
    expect(config).toContain("expect: {timeout: 20_000}");
    expect(config).toContain("timeout: 180_000");
    for (const name of [
      "DATABASE_URL_TEST",
      "M2_TEST_NEON_HOST",
      "NEON_AUTH_BASE_URL",
      "NEON_AUTH_COOKIE_SECRET",
      "STRIPE_TEST_SECRET_KEY",
      "STRIPE_TEST_WEBHOOK_SECRET",
      "STRIPE_TEST_STARTUP_PRICE_ID",
      "STRIPE_TEST_CORPORATE_PRICE_ID",
      "APP_URL",
      "M2_TEST_STAFF_EMAIL",
      "M2_TEST_STAFF_PASSWORD",
      "M2_TEST_MEMBER_EMAIL",
      "M2_TEST_MEMBER_PASSWORD",
      "M2_TEST_COMPANY_ADMIN_EMAIL",
      "M2_TEST_COMPANY_ADMIN_PASSWORD",
    ]) expect(runtime).toContain(name);

    const spec = read("tests/e2e/m2-admin-crm.spec.ts");
    for (const evidence of ["M2 Risk 01", "Content-Type", "event_attended", "ARR", "/zh/admin", "404", "AxeBuilder", "company-admin"])
      expect(spec).toContain(evidence);
    expect(spec).toContain('getByRole("textbox", {name: en.Admin.member360.noteBody, exact: true})');
    expect(spec).toContain("locator('p[role=\"alert\"]')");
    expect(spec.match(/`\/api\/admin\/segments\/\$\{M2_UUIDS\.segments\[0\]\}\/export`/g)).toHaveLength(2);
    expect(spec).toContain('(role ?? "anonymous") + " segment export API"');
    expect(spec).toContain("VERCEL_SHARE_TOKEN");
    expect(runtime).not.toContain("VERCEL_SHARE_TOKEN");
    expect(spec.match(/toBeVisible\(\{timeout: 20_000\}\)/g)).toHaveLength(2);
    expect(spec).toContain('hostname.endsWith(".vercel.app")');
    expect(config).toContain("process.env.VERCEL_SHARE_TOKEN ? 'off' : 'on-first-retry'");
  });

  it("casts approval audit target ids across the text and UUID boundary", () => {
    const reset = read("tests/fixtures/m2-reset.ts");
    expect(reset).toContain("target_id=$1::text");
    expect(reset).toContain("FROM approvals WHERE id=$2::uuid");
  });

  it("documents credential names without populating values", () => {
    const env = read(".env.example");
    for (const name of [
      "M2_TEST_STAFF_EMAIL",
      "M2_TEST_STAFF_PASSWORD",
      "M2_TEST_MEMBER_EMAIL",
      "M2_TEST_MEMBER_PASSWORD",
      "M2_TEST_COMPANY_ADMIN_EMAIL",
      "M2_TEST_COMPANY_ADMIN_PASSWORD",
    ]) expect(env).toContain(name + "=");
  });
});