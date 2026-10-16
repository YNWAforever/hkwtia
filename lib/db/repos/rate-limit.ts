import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {getDb} from "@/lib/db/repos/common";

export type SharedRateLimitInput = Readonly<{scope: "guest-rsvp" | "ticket-checkout" | "auth-send-ip" | "auth-send-email" | "auth-credential-ip"; keyHash: string; now: Date}>;
export type SharedRateLimitDecision = Readonly<{allowed: boolean; retryAfterSeconds: number}>;
type Executor = Readonly<{execute: (statement: SQL) => PromiseLike<unknown>}>;
const inputSchema = z.object({scope: z.enum(["guest-rsvp", "ticket-checkout", "auth-send-ip", "auth-send-email", "auth-credential-ip"]), keyHash: z.string().regex(/^[a-f0-9]{64}$/), now: z.date()}).strict();
const bucketRow = z.object({count: z.coerce.number().int().positive(), expiresAt: z.coerce.date()});
const countRow = z.object({count: z.coerce.number().int().nonnegative()});
const POLICIES: Readonly<Record<SharedRateLimitInput["scope"], {limit: number; windowMs: number}>> = {
  "guest-rsvp": {limit: 5, windowMs: 15 * 60_000},
  "ticket-checkout": {limit: 5, windowMs: 15 * 60_000},
  "auth-send-ip": {limit: 10, windowMs: 60 * 60_000},
  "auth-send-email": {limit: 3, windowMs: 15 * 60_000},
  "auth-credential-ip": {limit: 20, windowMs: 5 * 60_000},
};
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

/** Atomic fixed-duration bucket shared by all web instances. Store failures propagate to fail closed. */
export function createRateLimitRepository(loadDatabase: () => Promise<Executor> = async () => await getDb() as unknown as Executor) {
  return {
    async consumeRateLimit(input: SharedRateLimitInput): Promise<SharedRateLimitDecision> {
      const parsed = inputSchema.parse(input);
      if (!Number.isFinite(parsed.now.getTime())) throw new Error("INVALID_RATE_LIMIT_TIME");
      const db = await loadDatabase();
      const policy = POLICIES[parsed.scope];
      const expiry = new Date(parsed.now.getTime() + policy.windowMs);
      const result = rows(await db.execute(sql`
        INSERT INTO rate_limit_buckets (scope, key_hash, window_started_at, expires_at, count)
        VALUES (${parsed.scope}, ${parsed.keyHash}, ${parsed.now}, ${expiry}, 1)
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          window_started_at = CASE WHEN rate_limit_buckets.expires_at <= ${parsed.now} THEN ${parsed.now} ELSE rate_limit_buckets.window_started_at END,
          expires_at = CASE WHEN rate_limit_buckets.expires_at <= ${parsed.now} THEN ${expiry} ELSE rate_limit_buckets.expires_at END,
          count = CASE WHEN rate_limit_buckets.expires_at <= ${parsed.now} THEN 1 ELSE rate_limit_buckets.count + 1 END
        WHERE rate_limit_buckets.expires_at <= ${parsed.now} OR rate_limit_buckets.count < ${policy.limit}
        RETURNING count, expires_at AS "expiresAt"
      `));
      if (result.length) {
        bucketRow.parse(result[0]);
        return {allowed: true, retryAfterSeconds: 0};
      }
      const current = bucketRow.parse(rows(await db.execute(sql`SELECT count, expires_at AS "expiresAt" FROM rate_limit_buckets WHERE scope = ${parsed.scope} AND key_hash = ${parsed.keyHash} LIMIT 1`))[0]);
      return {allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt.getTime() - parsed.now.getTime()) / 1000))};
    },
    async cleanupExpired(now: Date): Promise<number> {
      if (!Number.isFinite(now.getTime())) throw new Error("INVALID_RATE_LIMIT_TIME");
      const db = await loadDatabase();
      const result = rows(await db.execute(sql`
        WITH removed AS (
          DELETE FROM rate_limit_buckets
          WHERE ctid IN (
            SELECT ctid FROM rate_limit_buckets WHERE expires_at <= ${now}
            ORDER BY expires_at LIMIT 1000
          ) RETURNING 1
        ) SELECT count(*)::int AS count FROM removed
      `));
      return countRow.parse(result[0]).count;
    },
  };
}
export const rateLimitRepository = createRateLimitRepository();
