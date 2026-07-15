import {afterEach, describe, expect, it, vi} from "vitest";

import {parseServerEnv, publicEnv, serverEnv} from "@/lib/config/env";

describe("runtime environment contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a deployed runtime without server credentials", () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: "production",
        DATABASE_URL: "",
      }),
    ).toThrow("DATABASE_URL");
  });

  it("returns the server-only values without exposing public keys", () => {
    const values = parseServerEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://db.example.test/hkwtia",
      NEON_AUTH_BASE_URL: "https://auth.example.test",
      NEON_AUTH_COOKIE_SECRET: "cookie-secret",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      STRIPE_STARTUP_PRICE_ID: "price_startup",
      STRIPE_CORPORATE_PRICE_ID: "price_corporate",
      APP_URL: "https://www.example.test",
    });

    expect(values).toEqual({
      databaseUrl: "postgres://db.example.test/hkwtia",
      neonAuthBaseUrl: "https://auth.example.test",
      neonAuthCookieSecret: "cookie-secret",
      stripeSecretKey: "sk_test_example",
      stripeWebhookSecret: "whsec_example",
      stripeStartupPriceId: "price_startup",
      stripeCorporatePriceId: "price_corporate",
      appUrl: "https://www.example.test",
    });
    expect(values).not.toHaveProperty("NEXT_PUBLIC_SITE_URL");
  });

  it("reads the public site URL without requiring server credentials", () => {
    expect(
      publicEnv({
        NODE_ENV: "test",
        NEXT_PUBLIC_SITE_URL: "https://www.example.test",
      }),
    ).toEqual({siteUrl: "https://www.example.test"});
  });

  it("uses process.env when called without an override", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://local.example.test");
    expect(serverEnv()).toEqual({
      databaseUrl: "",
      neonAuthBaseUrl: "",
      neonAuthCookieSecret: "",
      stripeSecretKey: "",
      stripeWebhookSecret: "",
      stripeStartupPriceId: "",
      stripeCorporatePriceId: "",
      appUrl: "",
    });
  });

  it.each(["STRIPE_STARTUP_PRICE_ID", "STRIPE_CORPORATE_PRICE_ID"])(
    "fails closed in production when %s is missing",
    (missingKey) => {
      const environment: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://db.example.test/hkwtia",
        NEON_AUTH_BASE_URL: "https://auth.example.test",
        NEON_AUTH_COOKIE_SECRET: "cookie-secret",
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        STRIPE_STARTUP_PRICE_ID: "price_startup",
        STRIPE_CORPORATE_PRICE_ID: "price_corporate",
        APP_URL: "https://www.example.test",
        [missingKey]: "",
      };
      expect(() => parseServerEnv(environment)).toThrow(missingKey);
    },
  );
});
