import type {SQL} from "drizzle-orm";
import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {createRateLimitStore} from "@/lib/db/repos/rate-limits";
import {
  createInMemoryRateLimiter,
  createSharedRateLimiter,
  type RateLimitBucketState,
  type RateLimitHit,
  type RateLimitStore,
} from "@/lib/security/rate-limit";

/**
 * Stands in for the `rate_limits` table: one map, shared by however many
 * limiter instances the test creates. `hit` is a single synchronous mutation
 * for the same reason the SQL is a single statement.
 */
function fakeStore(): RateLimitStore & Readonly<{size: () => number}> {
  const rows = new Map<string, {expiresAt: number; hitCount: number}>();
  return {
    size: () => rows.size,
    hit({key, at, windowMs}: RateLimitHit): Promise<RateLimitBucketState> {
      const existing = rows.get(key);
      const row = !existing || existing.expiresAt <= at.getTime()
        ? {expiresAt: at.getTime() + windowMs, hitCount: 0}
        : existing;
      row.hitCount += 1;
      rows.set(key, row);
      return Promise.resolve({hitCount: row.hitCount, expiresAt: new Date(row.expiresAt)});
    },
    pruneExpired(asOf: Date): Promise<void> {
      for (const [key, row] of rows) {
        if (row.expiresAt <= asOf.getTime()) rows.delete(key);
      }
      return Promise.resolve();
    },
  };
}

function limiter(store: RateLimitStore, over: Partial<Parameters<typeof createSharedRateLimiter>[0]> = {}) {
  return createSharedRateLimiter({
    store,
    limit: 3,
    windowMs: 60_000,
    now: () => 1_000_000,
    fallback: createInMemoryRateLimiter({limit: 3, windowMs: 60_000}),
    ...over,
  });
}

describe("shared rate limiter", () => {
  // The whole reason this exists. Two limiters are two serverless instances;
  // with createInMemoryRateLimiter each would have had its own count and the
  // real ceiling would have been 3 x instances.
  it("enforces ONE quota across independent limiter instances", async () => {
    const store = fakeStore();
    const instanceA = limiter(store);
    const instanceB = limiter(store);

    expect((await instanceA.check("victim")).allowed).toBe(true);
    expect((await instanceB.check("victim")).allowed).toBe(true);
    expect((await instanceA.check("victim")).allowed).toBe(true);

    // The fourth hit is refused no matter which instance receives it.
    expect((await instanceB.check("victim")).allowed).toBe(false);
    expect((await instanceA.check("victim")).allowed).toBe(false);
  });

  it("keeps separate keys independent", async () => {
    const store = fakeStore();
    const shared = limiter(store);
    for (let i = 0; i < 3; i += 1) await shared.check("a");

    expect((await shared.check("a")).allowed).toBe(false);
    expect((await shared.check("b")).allowed).toBe(true);
  });

  it("restarts the window once it expires, and reports a retry-after until then", async () => {
    const store = fakeStore();
    let clock = 1_000_000;
    const shared = limiter(store, {now: () => clock});

    for (let i = 0; i < 3; i += 1) await shared.check("k");
    const blocked = await shared.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    clock += 60_000;
    expect((await shared.check("k")).allowed).toBe(true);
  });

  it("counts refused attempts, so hammering a blocked bucket cannot reset it", async () => {
    const store = fakeStore();
    let clock = 1_000_000;
    const shared = limiter(store, {now: () => clock});

    for (let i = 0; i < 3; i += 1) await shared.check("k");
    clock += 59_000;
    for (let i = 0; i < 20; i += 1) await shared.check("k");
    // Still inside the original window, so still refused; the extra hits did
    // not push the expiry out either.
    expect((await shared.check("k")).allowed).toBe(false);
    clock += 1_000;
    expect((await shared.check("k")).allowed).toBe(true);
  });

  it("degrades to the process-local bucket when the store is unreachable", async () => {
    const failing: RateLimitStore = {
      hit: () => Promise.reject(new Error("connection terminated")),
      pruneExpired: () => Promise.resolve(),
    };
    const onStoreError = vi.fn();
    const shared = limiter(failing, {
      fallback: createInMemoryRateLimiter({limit: 2, windowMs: 60_000}),
      onStoreError,
    });

    // A database blip must not lock everyone out of sign-in...
    expect((await shared.check("k")).allowed).toBe(true);
    expect((await shared.check("k")).allowed).toBe(true);
    // ...but the guard must not vanish either.
    expect((await shared.check("k")).allowed).toBe(false);
    expect(onStoreError).toHaveBeenCalled();
    expect(String(onStoreError.mock.calls[0]?.[0])).toContain("connection terminated");
  });

  it("refuses an empty key rather than sharing one bucket for it", async () => {
    expect((await limiter(fakeStore()).check("")).allowed).toBe(false);
  });

  it("rejects a nonsensical configuration instead of limiting nothing", () => {
    const store = fakeStore();
    for (const bad of [{limit: 0}, {limit: 1.5}, {windowMs: 0}, {windowMs: -1}]) {
      expect(() => limiter(store, bad)).toThrow("RATE_LIMIT_CONFIGURATION_INVALID");
    }
  });

  it("prunes expired rows, amortized to once per window", async () => {
    const store = fakeStore();
    const prune = vi.spyOn(store, "pruneExpired");
    let clock = 1_000_000;
    const shared = limiter(store, {now: () => clock});

    for (let i = 0; i < 5; i += 1) await shared.check(`k${i}`);
    expect(prune).toHaveBeenCalledTimes(1);

    clock += 60_000;
    await shared.check("later");
    expect(prune).toHaveBeenCalledTimes(2);
    // The five buckets from the first window are gone; only `later` remains.
    await Promise.resolve();
    expect(store.size()).toBe(1);
  });
});

describe("the Postgres rate-limit store", () => {
  // Serialized with drizzle's own dialect, so these assertions are about the
  // statement Postgres actually receives rather than the template source.
  const dialect = new PgDialect();

  function capture() {
    const executed: {sql: string; params: unknown[]}[] = [];
    const database = {
      execute(query: unknown) {
        const {sql: text, params} = dialect.sqlToQuery(query as SQL);
        executed.push({sql: text.replace(/\s+/g, " ").trim(), params});
        return Promise.resolve({rows: [{hit_count: 1, expires_at: new Date(1_060_000).toISOString()}]});
      },
    };
    return {executed, store: createRateLimitStore(() => Promise.resolve(database))};
  }

  it("increments and reads the bucket in a single statement", async () => {
    const {executed, store} = capture();
    const bucket = await store.hit({key: "auth:send:email:abc", at: new Date(1_000_000), windowMs: 60_000});

    expect(executed).toHaveLength(1);
    // A read followed by a write would let two instances observe the same
    // count and both allow; the upsert is what makes the count authoritative.
    expect(executed[0]!.sql).toContain("insert into rate_limits");
    expect(executed[0]!.sql).toContain("on conflict (bucket_key) do update");
    expect(executed[0]!.sql).toContain("returning hit_count, expires_at");
    expect(executed[0]!.sql).not.toMatch(/\bselect\b/);
    expect(bucket).toEqual({hitCount: 1, expiresAt: new Date(1_060_000)});
  });

  it("parameterizes the key rather than interpolating it", async () => {
    const {executed, store} = capture();
    await store.hit({key: "a'); drop table rate_limits;--", at: new Date(1_000_000), windowMs: 60_000});

    expect(executed[0]!.sql).not.toContain("drop table");
    expect(executed[0]!.params).toContain("a'); drop table rate_limits;--");
  });

  it("expires on an absolute timestamp, so mixed window lengths share the table safely", async () => {
    const {executed, store} = capture();
    await store.hit({key: "k", at: new Date(1_000_000), windowMs: 60_000});
    await store.pruneExpired(new Date(1_000_000));

    // The row carries when it dies, so the prune is the same comparison for
    // every caller and cannot delete a longer-window limiter's live bucket.
    expect(executed[0]!.params).toContain(new Date(1_060_000).toISOString());
    expect(executed[1]!.sql).toBe("delete from rate_limits where expires_at <= $1");
    expect(executed[1]!.params).toEqual([new Date(1_000_000).toISOString()]);
  });

  it("throws rather than treating a malformed row as an allowed request", async () => {
    const database = {execute: () => Promise.resolve({rows: [{hit_count: "nonsense", expires_at: null}]})};
    const store = createRateLimitStore(() => Promise.resolve(database));

    await expect(store.hit({key: "k", at: new Date(1_000_000), windowMs: 60_000}))
      .rejects.toThrow("RATE_LIMIT_ROW_MALFORMED");
  });
});
