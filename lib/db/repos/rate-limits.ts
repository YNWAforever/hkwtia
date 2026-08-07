import "server-only";

import {sql} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import type {
  RateLimitBucketState,
  RateLimitHit,
  RateLimitStore,
} from "@/lib/security/rate-limit";

type SqlExecutor = Readonly<{
  execute(query: unknown): Promise<unknown>;
}>;

export type RateLimitDatabaseLoader = () => Promise<SqlExecutor>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

function bucketFrom(row: Record<string, unknown> | undefined): RateLimitBucketState {
  const hitCount = Number(row?.hit_count);
  const expiresAt = row?.expires_at;
  const parsed = expiresAt instanceof Date
    ? expiresAt
    : new Date(String(expiresAt));
  if (!Number.isFinite(hitCount) || Number.isNaN(parsed.getTime())) {
    throw new Error("RATE_LIMIT_ROW_MALFORMED");
  }
  return {hitCount, expiresAt: parsed};
}

/**
 * A rate-limit store backed by the application database.
 *
 * The point of this over `createInMemoryRateLimiter` is that the count is
 * shared: a per-address send quota is only meaningful if every instance
 * decrements the same bucket. See `rateLimits` in `lib/db/schema-core.ts`.
 */
export function createRateLimitStore(
  loadDatabase: RateLimitDatabaseLoader = getDb,
): RateLimitStore {
  return Object.freeze({
    async hit({key, at, windowMs}: RateLimitHit): Promise<RateLimitBucketState> {
      const database = await loadDatabase();
      const expiresAt = new Date(at.getTime() + windowMs);
      // One statement, so two instances cannot both read the same count and
      // both allow. `ON CONFLICT DO UPDATE` takes a row lock, so concurrent
      // writers to one key serialize; the CASE restarts a window that has
      // already expired instead of resurrecting its count.
      const result = await database.execute(sql`
        insert into rate_limits (bucket_key, expires_at, hit_count)
        values (${key}, ${expiresAt.toISOString()}, 1)
        on conflict (bucket_key) do update set
          hit_count = case
            when rate_limits.expires_at <= ${at.toISOString()} then 1
            else rate_limits.hit_count + 1
          end,
          expires_at = case
            when rate_limits.expires_at <= ${at.toISOString()} then ${expiresAt.toISOString()}
            else rate_limits.expires_at
          end
        returning hit_count, expires_at
      `);
      return bucketFrom(rowsFrom(result)[0]);
    },

    async pruneExpired(asOf: Date): Promise<void> {
      const database = await loadDatabase();
      await database.execute(sql`
        delete from rate_limits where expires_at <= ${asOf.toISOString()}
      `);
    },
  });
}

export const rateLimitStore = createRateLimitStore();
