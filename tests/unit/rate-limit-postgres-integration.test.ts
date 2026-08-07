import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/pg-proxy";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createRateLimitStore} from "@/lib/db/repos/rate-limits";
import {createInMemoryRateLimiter, createSharedRateLimiter} from "@/lib/security/rate-limit";

/**
 * The unit suite proves the limiter's arithmetic against a fake store. Only a
 * real Postgres proves the part that matters: that `hit` is atomic, so two
 * instances racing on one bucket cannot both be allowed. A fake cannot show
 * that — it is single-threaded by construction.
 *
 * Runs the migration itself, so a change to the generated SQL is exercised
 * here rather than assumed.
 */
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-rate-limit-${process.pid}`;

function docker(args: string[], input?: string): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    input,
    timeout: 20_000,
    stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
  });
}

function psql(sql: string): string {
  return docker(
    ["exec", "-i", container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-At"],
    sql,
  );
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("isolated Postgres did not become ready");
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindParams(query: string, params: readonly unknown[]): string {
  let bound = query;
  for (let index = params.length - 1; index >= 0; index -= 1) {
    bound = bound.replaceAll(`$${index + 1}`, sqlLiteral(params[index]));
  }
  return bound;
}

function rows(query: string, params: readonly unknown[]): Record<string, unknown>[] {
  const output = psql(`${bindParams(query, params)};`).trim();
  if (!output) return [];
  // Every statement this store issues returns at most `hit_count|expires_at`.
  return output.split(/\r?\n/).map((line) => {
    const [hitCount, expiresAt] = line.split("|");
    return {hit_count: Number(hitCount), expires_at: expiresAt};
  });
}

function store() {
  const database = drizzle(async (query, params) => ({rows: rows(query, params)}));
  return createRateLimitStore(async () => database as never);
}

function limiter(limit: number) {
  return createSharedRateLimiter({
    store: store(),
    limit,
    windowMs: 60_000,
    fallback: createInMemoryRateLimiter({limit, windowMs: 60_000}),
  });
}

describe.skipIf(!enabled)("the shared rate limiter on isolated Postgres 16", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "postgres:16-alpine"]);
    await waitForPostgres();
    psql(readFileSync(resolve(process.cwd(), "drizzle/0018_m7_rate_limits.sql"), "utf8")
      .replaceAll("--> statement-breakpoint", ""));
  }, 90_000);

  afterAll(() => {
    try {
      docker(["rm", "-f", container]);
    } catch {
      /* Container may already be gone. */
    }
  });

  it("lets exactly `limit` of many concurrent checks through", async () => {
    psql("TRUNCATE rate_limits;");
    const shared = limiter(5);

    const results = await Promise.all(
      Array.from({length: 25}, () => shared.check("race")),
    );

    // A read-then-write store would let several of these observe the same
    // count and all be allowed. This is the property the in-memory limiter
    // could not provide across instances.
    expect(results.filter(({allowed}) => allowed)).toHaveLength(5);
    expect(psql("SELECT hit_count FROM rate_limits WHERE bucket_key='race';").trim()).toBe("25");
  }, 30_000);

  it("enforces one quota across two independent limiter instances", async () => {
    psql("TRUNCATE rate_limits;");
    const instanceA = limiter(3);
    const instanceB = limiter(3);

    expect((await instanceA.check("victim")).allowed).toBe(true);
    expect((await instanceB.check("victim")).allowed).toBe(true);
    expect((await instanceA.check("victim")).allowed).toBe(true);
    const refused = await instanceB.check("victim");

    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  }, 30_000);

  it("restarts an expired window instead of resurrecting its count", async () => {
    psql("TRUNCATE rate_limits; INSERT INTO rate_limits VALUES ('stale', now() - interval '1 second', 99);");

    expect((await limiter(3).check("stale")).allowed).toBe(true);
    expect(psql("SELECT hit_count FROM rate_limits WHERE bucket_key='stale';").trim()).toBe("1");
  }, 30_000);

  it("prunes only rows past their own expiry, whatever window wrote them", async () => {
    psql(`TRUNCATE rate_limits;
      INSERT INTO rate_limits VALUES ('short', now() + interval '30 seconds', 1);
      INSERT INTO rate_limits VALUES ('long',  now() + interval '1 hour', 1);
      INSERT INTO rate_limits VALUES ('dead',  now() - interval '1 second', 1);`);

    await store().pruneExpired(new Date());

    // A prune computed from any one limiter's window would have taken `long`
    // with it and silently reset that limiter's quota.
    expect(psql("SELECT bucket_key FROM rate_limits ORDER BY bucket_key;").trim().split(/\r?\n/))
      .toEqual(["long", "short"]);
  }, 30_000);
});
