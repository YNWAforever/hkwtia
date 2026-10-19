import {describe, expect, it} from "vitest";

import {
  DEFAULT_RATE_LIMIT_WAIT_SECONDS,
  loginRetryDeadline,
  MAX_RATE_LIMIT_WAIT_SECONDS,
  parseLoginRetryUntil,
  rateLimitWaitSeconds,
  remainingWaitSeconds,
} from "@/lib/auth/rate-limit-wait";

describe("rate-limit retry wait", () => {
  it("does not apply a cooldown to non-rate-limit errors", () => {
    expect(rateLimitWaitSeconds("invalid_email", "120")).toBe(0);
  });

  it.each([undefined, "", "0", "-1", "not-a-number", "1.5", "0x10", "1e2"])(
    "uses the safe fallback for an invalid wait value (%s)",
    (wait) => {
      expect(rateLimitWaitSeconds("rate_limited", wait)).toBe(DEFAULT_RATE_LIMIT_WAIT_SECONDS);
    },
  );

  it("honours a valid positive wait and caps it at one hour", () => {
    expect(rateLimitWaitSeconds("rate_limited", "120")).toBe(120);
    expect(rateLimitWaitSeconds("rate_limited", String(MAX_RATE_LIMIT_WAIT_SECONDS + 1))).toBe(MAX_RATE_LIMIT_WAIT_SECONDS);
  });

  it("accepts an expired outcome without renewing it and rejects invalid or unbounded deadlines", () => {
    const now = new Date("2026-10-19T12:00:00Z").getTime();
    expect(parseLoginRetryUntil(String(now - 1_000), now)).toBe(now - 1_000);
    expect(parseLoginRetryUntil(String(now + 120_000), now)).toBe(now + 120_000);
    for (const value of [undefined, "", "NaN", "Infinity", "-1", "1.5", String(now + 3_600_001)]) {
      expect(parseLoginRetryUntil(value, now)).toBeUndefined();
    }
  });

  it("uses injected time for deadline creation and SSR-safe remaining seconds", () => {
    expect(loginRetryDeadline(1_000, 120)).toBe(121_000);
    expect(remainingWaitSeconds(121_000, 1_000)).toBe(120);
    expect(remainingWaitSeconds(1_000, 2_000)).toBe(0);
  });
});
