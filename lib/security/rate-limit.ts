export type RateLimitResult = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}>;

export type RateLimiter = Readonly<{
  check: (key: string) => RateLimitResult;
}>;

/**
 * The same contract, for limiters whose state lives outside the process.
 * Separate from `RateLimiter` so the process-local callers that do not need a
 * fleet-wide quota keep a synchronous check.
 */
export type AsyncRateLimiter = Readonly<{
  check: (key: string) => Promise<RateLimitResult>;
}>;

/**
 * Presents a process-local limiter through the async contract. Used where a
 * caller needs the async shape but not a fleet-wide quota.
 */
export function asAsyncRateLimiter(limiter: RateLimiter): AsyncRateLimiter {
  return Object.freeze({check: (key: string) => Promise.resolve(limiter.check(key))});
}

/** One bucket, as the shared store sees it. */
export type RateLimitBucketState = Readonly<{
  hitCount: number;
  expiresAt: Date;
}>;

export type RateLimitHit = Readonly<{
  key: string;
  at: Date;
  windowMs: number;
}>;

/**
 * A store backing `createSharedRateLimiter`.
 *
 * `hit` must record the hit and report the resulting count in ONE atomic
 * operation. A read-then-write pair would let two instances observe the same
 * count and both allow the request, which is the exact failure this replaces.
 */
export type RateLimitStore = Readonly<{
  hit: (input: RateLimitHit) => Promise<RateLimitBucketState>;
  pruneExpired: (asOf: Date) => Promise<void>;
}>;

type SharedRateLimitOptions = Readonly<{
  store: RateLimitStore;
  limit: number;
  windowMs: number;
  now?: () => number;
  /**
   * Used when the store is unreachable. Without it a database blip would lock
   * every member out of sign-in; with it the guard degrades to the old
   * process-local ceiling instead of vanishing or failing closed.
   */
  fallback: RateLimiter;
  onStoreError?: (error: unknown) => void;
}>;

/**
 * A fixed-window limiter whose buckets live in a shared store, so the quota
 * holds across every instance rather than per process.
 */
export function createSharedRateLimiter(
  options: SharedRateLimitOptions,
): AsyncRateLimiter {
  if (
    !Number.isSafeInteger(options.limit)
    || options.limit < 1
    || !Number.isSafeInteger(options.windowMs)
    || options.windowMs < 1
  ) {
    throw new Error("RATE_LIMIT_CONFIGURATION_INVALID");
  }
  const now = options.now ?? Date.now;
  let prunedAt = Number.NEGATIVE_INFINITY;

  // Amortized, like the in-memory sweep: once per window per process is enough
  // to keep the table bounded, and it must never delay or fail the request it
  // rode in on.
  function pruneOccasionally(current: number, at: Date): void {
    if (current - prunedAt < options.windowMs) return;
    prunedAt = current;
    void options.store.pruneExpired(at).catch((error: unknown) => {
      options.onStoreError?.(error);
    });
  }

  return Object.freeze({
    async check(key: string): Promise<RateLimitResult> {
      if (!key) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(options.windowMs / 1_000),
        };
      }
      const current = now();
      const at = new Date(current);
      let bucket: RateLimitBucketState;
      try {
        bucket = await options.store.hit({key, at, windowMs: options.windowMs});
      } catch (error) {
        options.onStoreError?.(error);
        return options.fallback.check(key);
      }
      pruneOccasionally(current, at);

      // The store counts refused attempts too, so hammering a blocked bucket
      // cannot reset it. `remaining` is floored rather than going negative.
      const allowed = bucket.hitCount <= options.limit;
      return {
        allowed,
        remaining: Math.max(0, options.limit - bucket.hitCount),
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil((bucket.expiresAt.getTime() - current) / 1_000)),
      };
    },
  });
}

type RateLimitOptions = Readonly<{
  limit: number;
  windowMs: number;
  now?: () => number;
  maxEntries?: number;
}>;

/**
 * Process-local fixed-window limiter. This protects a single Next.js process;
 * production deployments that need a fleet-wide quota must replace this
 * interface with a shared atomic store without changing the route contract.
 *
 * Keys are attacker-influenced, so expired buckets are swept and the map is
 * capped; without that a public endpoint grows the heap without bound.
 */
export function createInMemoryRateLimiter(
  options: RateLimitOptions,
): RateLimiter {
  if (
    !Number.isSafeInteger(options.limit)
    || options.limit < 1
    || !Number.isSafeInteger(options.windowMs)
    || options.windowMs < 1
  ) {
    throw new Error("RATE_LIMIT_CONFIGURATION_INVALID");
  }
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? 10_000;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new Error("RATE_LIMIT_MAX_ENTRIES_INVALID");
  }
  const buckets = new Map<string, {startedAt: number; count: number}>();
  let sweptAt = Number.NEGATIVE_INFINITY;

  // Amortized: a full scan on every call would let an attacker who has filled
  // the map to the cap impose that scan on every subsequent request. Sweeping
  // once per window still reclaims expired buckets, and exceeding the cap
  // forces an immediate sweep, so the map size stays hard-bounded.
  function cleanup(current: number): void {
    if (buckets.size <= maxEntries && current - sweptAt < options.windowMs) return;
    sweptAt = current;
    for (const [key, bucket] of buckets) {
      if (current - bucket.startedAt >= options.windowMs) buckets.delete(key);
    }
    while (buckets.size > maxEntries) {
      const oldest = buckets.keys().next().value;
      if (typeof oldest !== "string") break;
      buckets.delete(oldest);
    }
  }

  return Object.freeze({
    check(key: string): RateLimitResult {
      if (!key) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil(options.windowMs / 1_000),
        };
      }
      const current = now();
      const existing = buckets.get(key);
      const bucket = !existing || current - existing.startedAt >= options.windowMs
        ? {startedAt: current, count: 0}
        : existing;

      if (bucket.count >= options.limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (bucket.startedAt + options.windowMs - current) / 1_000,
            ),
          ),
        };
      }

      bucket.count += 1;
      buckets.set(key, bucket);
      cleanup(current);
      return {
        allowed: true,
        remaining: options.limit - bucket.count,
        retryAfterSeconds: 0,
      };
    },
  });
}
