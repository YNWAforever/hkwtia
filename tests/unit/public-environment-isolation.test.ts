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

  // `lib/auth/server` is reachable from `lib/auth/actor`, which `events` and
  // `showcase` import for `requireAdmin`. While it read `authEnv()` at module
  // scope, importing any of them threw without the Neon Auth pair — so
  // /sitemap.xml, /events, /showcase, /launchpad and /join all 500'd before
  // running any of their own code, and the sitemap's per-read try/catch never
  // got the chance to fire.
  it.each([
    ["@/lib/db/repos/events"],
    ["@/lib/db/repos/showcase"],
    ["@/lib/db/repos/public-posts"],
    ["@/lib/auth/authorize"],
    // A public page must import the Server Action it binds to a form, and an
    // action module resolves its own actor — so these reach lib/auth/actor.
    // Importing one must not require credentials the page never uses.
    ["@/lib/auth/actor"],
    ["@/lib/launchpad/member-actions"],
    ["@/lib/showcase/member-actions"],
  ])("imports %s without the Neon Auth pair configured", async (specifier) => {
    vi.stubEnv("DATABASE_URL", "postgres://db.example.test/hkwtia");
    await expect(import(specifier)).resolves.toBeDefined();
  });

  it("builds the sitemap without the Neon Auth pair configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://db.example.test/hkwtia");
    const {default: sitemap} = await import("@/app/sitemap");
    // Every database read is individually caught, so an unreachable database
    // degrades to the static public routes rather than failing the document.
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some(({url}) => url.endsWith("/privacy"))).toBe(true);
  }, 20_000);

  // The split must not soften the boundary it was carved out of: importing the
  // session reader still fails closed in production, as auth-server-runtime pins.
  it("still fails closed when the session reader itself is imported", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    await expect(import("@/lib/auth/server")).rejects.toThrow("NEON_AUTH_BASE_URL");
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
