import "server-only";

import {createHmac} from "node:crypto";

import {rateLimitRepository, type SharedRateLimitInput, type SharedRateLimitDecision} from "@/lib/db/repos/rate-limit";

type Scope = SharedRateLimitInput["scope"];
type Store = Readonly<{consumeRateLimit: (input: SharedRateLimitInput) => Promise<SharedRateLimitDecision>}>;

export function rateLimitKeyHash(scope: Scope, rawKey: string, secret: string): string {
  if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("RATE_LIMIT_KEY_SECRET_REQUIRED");
  if (!rawKey || rawKey.length > 400) throw new Error("INVALID_RATE_LIMIT_KEY");
  return createHmac("sha256", secret).update(scope).update("\0").update(rawKey).digest("hex");
}

/** Adapter for public actions; the repository sees only a server-keyed digest. */
export function createSharedRateLimiter(scope: Scope, secret: string, store: Store = rateLimitRepository, now: () => Date = () => new Date()) {
  return {
    async check(rawKey: string): Promise<SharedRateLimitDecision> {
      return store.consumeRateLimit({scope, keyHash: rateLimitKeyHash(scope, rawKey, secret), now: now()});
    },
  };
}
