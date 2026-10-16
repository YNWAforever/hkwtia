import {describe, expect, it, vi} from "vitest";

import {createSharedRateLimiter, rateLimitKeyHash} from "@/lib/security/shared-rate-limit";
import type {SharedRateLimitInput} from "@/lib/db/repos/rate-limit";

describe("shared rate-limit key adapter", () => {
  it("stores only server-keyed digests with scope separation", async () => {
    const raw = "ip:203.0.113.9";
    const secret = "s".repeat(32);
    const consumeRateLimit = vi.fn(async (_input: SharedRateLimitInput) => ({allowed: true, retryAfterSeconds: 0}));
    const now = new Date("2026-09-27T00:00:00Z");
    const limiter = createSharedRateLimiter("guest-rsvp", secret, {consumeRateLimit}, () => now);
    await expect(limiter.check(raw)).resolves.toEqual({allowed: true, retryAfterSeconds: 0});
    const input = consumeRateLimit.mock.calls[0]![0];
    expect(input.scope).toBe("guest-rsvp");
    expect(input.now).toEqual(now);
    expect(input.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.keyHash).not.toContain(raw);
    expect(rateLimitKeyHash("ticket-checkout", raw, secret)).not.toBe(input.keyHash);
    expect(rateLimitKeyHash("guest-rsvp", raw, "x".repeat(32))).not.toBe(input.keyHash);
  });
  it("refuses missing or weak digest configuration before store access", async () => {
    const consumeRateLimit = vi.fn(async (_input: SharedRateLimitInput) => ({allowed: true, retryAfterSeconds: 0}));
    const limiter = createSharedRateLimiter("ticket-checkout", "", {consumeRateLimit});
    await expect(limiter.check("ip:203.0.113.9")).rejects.toThrow("RATE_LIMIT_KEY_SECRET_REQUIRED");
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
});
