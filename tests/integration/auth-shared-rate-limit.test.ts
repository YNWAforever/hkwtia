import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createRateLimitRepository} from "@/lib/db/repos/rate-limit";
import {checkAuthSend, rateLimitAuthRequest} from "@/lib/auth/rate-limit";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const now = new Date("2026-09-27T04:00:00Z");
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;
const secret = "synthetic-rate-limit-secret-at-least-32-bytes";
function post(email: string, ip: string) {
  return new Request("https://hkwtia.test/api/auth/sign-in/magic-link", {method: "POST", headers: {"x-vercel-forwarded-for": ip}, body: JSON.stringify({email})});
}

describe.skipIf(!enabled)("shared auth limits on disposable PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase();
    for (const filename of ["drizzle/0049_shared_rate_limit.sql", "drizzle/0051_auth_rate_limits.sql"]) {
      const migration = readFileSync(filename, "utf8");
      for (const statement of migration.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean)) await fixture.pool.query(statement);
    }
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("shares one address quota across direct action and route instances with consistent retry timing", async () => {
    const first = {store: createRateLimitRepository(async () => fixture.database), secret, now: () => now};
    const second = {store: createRateLimitRepository(async () => fixture.database), secret, now: () => now};
    const email = "synthetic@example.test";
    const results = await Promise.all([
      checkAuthSend({ip: "203.0.113.1", email}, first),
      rateLimitAuthRequest(post(email, "203.0.113.2"), second),
      checkAuthSend({ip: "203.0.113.3", email}, first),
    ]);
    expect(results[0]).toMatchObject({allowed: true});
    expect(results[1]).toBeNull();
    expect(results[2]).toMatchObject({allowed: true});
    // A fresh repository instance still observes the same PostgreSQL bucket.
    const cold = {store: createRateLimitRepository(async () => fixture.database), secret, now: () => now};
    const blocked = await rateLimitAuthRequest(post(email, "203.0.113.4"), cold);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBe("900");
  });

  it("keeps the ten-per-hour IP and twenty-per-five-minute credential ceilings", async () => {
    const deps = {store: createRateLimitRepository(async () => fixture.database), secret, now: () => now};
    const sends = await Promise.all(Array.from({length: 11}, (_, index) =>
      checkAuthSend({ip: "203.0.113.100", email: `ip-${index}@example.test`}, deps)));
    expect(sends.filter(item => item.allowed)).toHaveLength(10);
    expect(sends.find(item => !item.allowed)?.retryAfterSeconds).toBe(3600);
    const credential = () => rateLimitAuthRequest(new Request("https://hkwtia.test/api/auth/sign-in/email", {
      method: "POST", headers: {"x-vercel-forwarded-for": "203.0.113.101"}, body: "{}",
    }), deps);
    const guesses = await Promise.all(Array.from({length: 21}, credential));
    expect(guesses.filter(item => item === null)).toHaveLength(20);
    expect(guesses.find(item => item !== null)?.headers.get("retry-after")).toBe("300");
  });

  it("refuses email and credential effects on store outage while leaving social and session paths alone", async () => {
    const down = {store: createRateLimitRepository(async () => {throw new Error("DATABASE_DOWN");}), secret, now: () => now};
    await expect(checkAuthSend({ip: "203.0.113.9", email: "down@example.test"}, down)).resolves.toMatchObject({allowed: false, unavailable: true});
    expect((await rateLimitAuthRequest(post("down@example.test", "203.0.113.9"), down))?.status).toBe(503);
    const social = new Request("https://hkwtia.test/api/auth/sign-in/social", {method: "POST"});
    expect(await rateLimitAuthRequest(social, down)).toBeNull();
  });
});
