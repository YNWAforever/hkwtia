export type RateLimitResult = Readonly<{
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}>;

export type RateLimiter = Readonly<{
  check: (key: string) => RateLimitResult;
}>;

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
