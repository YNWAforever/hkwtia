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
}>;

/**
 * Process-local fixed-window limiter. This protects a single Next.js process;
 * production deployments that need a fleet-wide quota must replace this
 * interface with a shared atomic store without changing the route contract.
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
  const buckets = new Map<string, {startedAt: number; count: number}>();

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
      return {
        allowed: true,
        remaining: options.limit - bucket.count,
        retryAfterSeconds: 0,
      };
    },
  });
}
