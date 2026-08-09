import {beforeEach, describe, expect, it, vi} from "vitest";

describe("public environment boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
  });

  it("imports the database client with only DATABASE_URL configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://db.example.test/hkwtia");
    const {db} = await import("@/lib/db/client");
    expect(db).toBeDefined();
  });

  it("imports auth without unrelated email, Stripe, cron, or Concierge values", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "neon-cookie-secret");
    const {auth} = await import("@/lib/auth/server");
    expect(auth).toBeDefined();
  });

  it("imports the public showcase lead action without unrelated production values", async () => {
    vi.stubEnv("APP_URL", "https://hkwtia.vercel.app");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "test");
    vi.stubEnv("EMAIL_FROM", "test@example.com");
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "neon-cookie-secret");
    const {requestIntroAction} = await import("@/lib/showcase/lead-request-action");
    expect(requestIntroAction).toBeTypeOf("function");
  }, 20_000);
});
