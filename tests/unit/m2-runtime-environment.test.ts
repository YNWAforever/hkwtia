import {describe, expect, it} from "vitest";

import {M2_LIVE_ENV_NAMES, buildM2RuntimeEnvironment, missingM2LiveEnvironment} from "@/tests/fixtures/m2-runtime-env";

describe("M2 live runtime environment", () => {
  it("gates every test credential needed by database, auth, Stripe, company-admin, and app URL seams", () => {
    expect(M2_LIVE_ENV_NAMES).toEqual([
      "DATABASE_URL_TEST", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET",
      "STRIPE_TEST_SECRET_KEY", "STRIPE_TEST_WEBHOOK_SECRET", "STRIPE_TEST_STARTUP_PRICE_ID", "STRIPE_TEST_CORPORATE_PRICE_ID",
      "APP_URL", "M2_TEST_STAFF_EMAIL", "M2_TEST_STAFF_PASSWORD", "M2_TEST_MEMBER_EMAIL", "M2_TEST_MEMBER_PASSWORD",
      "M2_TEST_COMPANY_ADMIN_EMAIL", "M2_TEST_COMPANY_ADMIN_PASSWORD",
    ]);
    expect(missingM2LiveEnvironment({})).toEqual(M2_LIVE_ENV_NAMES);
  });

  it("maps only explicit test values to runtime names without inventing fallbacks", () => {
    const runtime = buildM2RuntimeEnvironment({
      DATABASE_URL_TEST: "test-db", STRIPE_TEST_SECRET_KEY: "test-secret", STRIPE_TEST_WEBHOOK_SECRET: "test-webhook",
      STRIPE_TEST_STARTUP_PRICE_ID: "test-startup", STRIPE_TEST_CORPORATE_PRICE_ID: "test-corporate", APP_URL: "http://127.0.0.1:3000",
    });
    expect(runtime).toMatchObject({
      DATABASE_URL: "test-db", STRIPE_SECRET_KEY: "test-secret", STRIPE_WEBHOOK_SECRET: "test-webhook",
      STRIPE_STARTUP_PRICE_ID: "test-startup", STRIPE_CORPORATE_PRICE_ID: "test-corporate", APP_URL: "http://127.0.0.1:3000",
    });
    expect(buildM2RuntimeEnvironment({})).toMatchObject({DATABASE_URL: "", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", STRIPE_STARTUP_PRICE_ID: "", STRIPE_CORPORATE_PRICE_ID: "", APP_URL: ""});
  });
});