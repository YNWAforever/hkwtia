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
      CONCIERGE_COOKIE_SECRET: "concierge-cookie-secret-separate-0001",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      STRIPE_STARTUP_PRICE_ID: "price_startup",
      STRIPE_CORPORATE_PRICE_ID: "price_corporate",
      RESEND_API_KEY: "re_test_example",
      EMAIL_FROM: "WTIA <notifications@example.test>",
      CRON_SECRET: "cron-secret",
      APP_URL: "https://www.example.test",
    });

    expect(values).toEqual({
      databaseUrl: "postgres://db.example.test/hkwtia",
      neonAuthBaseUrl: "https://auth.example.test",
      neonAuthCookieSecret: "cookie-secret",
      conciergeCookieSecret: "concierge-cookie-secret-separate-0001",
      stripeSecretKey: "sk_test_example",
      stripeWebhookSecret: "whsec_example",
      stripeStartupPriceId: "price_startup",
      stripeCorporatePriceId: "price_corporate",
      resendApiKey: "re_test_example",
      emailFrom: "WTIA <notifications@example.test>",
      emailDeliveryMode: "resend",
      cronSecret: "cron-secret",
      appUrl: "https://www.example.test",
      agentsEnabled: false,
      agentModelConcierge: "openai:gpt-4.1-mini",
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
      resendApiKey: "",
      emailFrom: "",
      emailDeliveryMode: "resend",
      cronSecret: "",
      appUrl: "",
      agentsEnabled: false,
      agentModelConcierge: "openai:gpt-4.1-mini",
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
        CONCIERGE_COOKIE_SECRET: "concierge-cookie-secret-separate-0001",
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        STRIPE_STARTUP_PRICE_ID: "price_startup",
        STRIPE_CORPORATE_PRICE_ID: "price_corporate",
        RESEND_API_KEY: "re_test_example",
        EMAIL_FROM: "WTIA <notifications@example.test>",
        CRON_SECRET: "cron-secret",
        APP_URL: "https://www.example.test",
        [missingKey]: "",
      };
      expect(() => parseServerEnv(environment)).toThrow(missingKey);
    },
  );

  it.each(["RESEND_API_KEY", "EMAIL_FROM", "CRON_SECRET"])(
    "fails closed in production when %s is missing",
    (missingKey) => {
      const environment: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://db.example.test/hkwtia",
        NEON_AUTH_BASE_URL: "https://auth.example.test",
        NEON_AUTH_COOKIE_SECRET: "cookie-secret",
        CONCIERGE_COOKIE_SECRET: "concierge-cookie-secret-separate-0001",
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        STRIPE_STARTUP_PRICE_ID: "price_startup",
        STRIPE_CORPORATE_PRICE_ID: "price_corporate",
        RESEND_API_KEY: "re_test_example",
        EMAIL_FROM: "WTIA <notifications@example.test>",
        CRON_SECRET: "cron-secret",
        APP_URL: "https://www.example.test",
        [missingKey]: "",
      };
      expect(() => parseServerEnv(environment)).toThrow(missingKey);
    },
  );

  it("allows explicit test email delivery only in a Vercel Preview", () => {
    const values = parseServerEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      EMAIL_DELIVERY_MODE: "test",
      DATABASE_URL: "postgres://db.example.test/hkwtia",
      NEON_AUTH_BASE_URL: "https://auth.example.test",
      NEON_AUTH_COOKIE_SECRET: "cookie-secret",
      CONCIERGE_COOKIE_SECRET: "concierge-cookie-secret-separate-0001",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      STRIPE_STARTUP_PRICE_ID: "price_startup",
      STRIPE_CORPORATE_PRICE_ID: "price_corporate",
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      CRON_SECRET: "cron-secret",
      APP_URL: "https://preview.example.test",
    });

    expect(values.emailDeliveryMode).toBe("test");
  });

  it("does not allow test email delivery to weaken production", () => {
    expect(() =>
      parseServerEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        EMAIL_DELIVERY_MODE: "test",
        DATABASE_URL: "postgres://db.example.test/hkwtia",
        NEON_AUTH_BASE_URL: "https://auth.example.test",
        NEON_AUTH_COOKIE_SECRET: "cookie-secret",
        CONCIERGE_COOKIE_SECRET: "concierge-cookie-secret-separate-0001",
        STRIPE_SECRET_KEY: "sk_test_example",
        STRIPE_WEBHOOK_SECRET: "whsec_example",
        STRIPE_STARTUP_PRICE_ID: "price_startup",
        STRIPE_CORPORATE_PRICE_ID: "price_corporate",
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        CRON_SECRET: "cron-secret",
        APP_URL: "https://www.example.test",
      }),
    ).toThrow("RESEND_API_KEY");
  });

  it("requires a dedicated strong Concierge cookie secret and rejects blank Turnstile configuration in production", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://db.example.test/hkwtia",
      NEON_AUTH_BASE_URL: "https://auth.example.test",
      NEON_AUTH_COOKIE_SECRET: "n".repeat(32),
      CONCIERGE_COOKIE_SECRET: "c".repeat(32),
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      STRIPE_STARTUP_PRICE_ID: "price_startup",
      STRIPE_CORPORATE_PRICE_ID: "price_corporate",
      RESEND_API_KEY: "re_test_example",
      EMAIL_FROM: "WTIA <notifications@example.test>",
      CRON_SECRET: "cron-secret",
      APP_URL: "https://www.example.test",
    };

    const missing = {...environment};
    delete missing.CONCIERGE_COOKIE_SECRET;
    expect(() => parseServerEnv(missing)).toThrow("CONCIERGE_COOKIE_SECRET");

    expect(() => parseServerEnv({
      ...environment,
      CONCIERGE_COOKIE_SECRET: "too-short",
    })).toThrow("CONCIERGE_COOKIE_SECRET");

    expect(() => parseServerEnv({
      ...environment,
      CONCIERGE_COOKIE_SECRET: environment.NEON_AUTH_COOKIE_SECRET,
    })).toThrow("CONCIERGE_COOKIE_SECRET");

    expect(() => parseServerEnv({
      ...environment,
      TURNSTILE_SECRET: "   ",
    })).toThrow("TURNSTILE_SECRET");

    // A secret with no site key rejects every Concierge request, because no
    // client can produce a token; a site key with no secret verifies nothing.
    expect(() => parseServerEnv({
      ...environment,
      TURNSTILE_SECRET: "turnstile-secret",
    })).toThrow("TURNSTILE_SECRET and TURNSTILE_SITE_KEY must be set together");

    expect(() => parseServerEnv({
      ...environment,
      TURNSTILE_SITE_KEY: "turnstile-site-key",
    })).toThrow("TURNSTILE_SECRET and TURNSTILE_SITE_KEY must be set together");

    expect(parseServerEnv({
      ...environment,
      TURNSTILE_SECRET: "turnstile-secret",
      TURNSTILE_SITE_KEY: "turnstile-site-key",
    })).toMatchObject({
      turnstileSecret: "turnstile-secret",
      turnstileSiteKey: "turnstile-site-key",
    });
  });
});
