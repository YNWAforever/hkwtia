import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createRateLimitRepository} from "@/lib/db/repos/rate-limit";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const now = new Date("2026-09-27T03:00:00.000Z");
const keyHash = "a".repeat(64);
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("shared registration limiter on disposable PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase();
    const migration = readFileSync("drizzle/0049_shared_rate_limit.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await fixture.pool.query(statement);
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("shares five attempts across instances, survives a cold start and resets after TTL", async () => {
    const first = createRateLimitRepository(async () => fixture.database);
    const second = createRateLimitRepository(async () => fixture.database);
    const attempts = await Promise.all(Array.from({length: 6}, (_, index) =>
      (index % 2 ? first : second).consumeRateLimit({scope: "guest-rsvp", keyHash, now})));
    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(5);
    expect(attempts.filter((attempt) => !attempt.allowed)).toHaveLength(1);
    expect(attempts.find((attempt) => !attempt.allowed)?.retryAfterSeconds).toBe(900);
    const cold = createRateLimitRepository(async () => fixture.database);
    expect((await cold.consumeRateLimit({scope: "guest-rsvp", keyHash, now})).allowed).toBe(false);
    expect((await cold.consumeRateLimit({scope: "ticket-checkout", keyHash, now})).allowed).toBe(true);
    expect((await cold.consumeRateLimit({scope: "guest-rsvp", keyHash, now: new Date(now.getTime() + 900_000)})).allowed).toBe(true);
    expect(await cold.cleanupExpired(new Date(now.getTime() + 900_001))).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("rejects rather than allowing a request when the shared store is unavailable", async () => {
    const down = createRateLimitRepository(async () => {throw new Error("DATABASE_DOWN");});
    await expect(down.consumeRateLimit({scope: "ticket-checkout", keyHash: "b".repeat(64), now})).rejects.toThrow("DATABASE_DOWN");
  });
});
