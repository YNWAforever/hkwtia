import {describe, expect, it, vi} from "vitest";

import {
  clientIpFromHeaders,
  isSameOrigin,
} from "@/lib/security/request-origin";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {verifyTurnstile} from "@/lib/security/turnstile";
import {conciergeRequestSchema} from "@/app/api/ai/concierge/route";

describe("Concierge public request security", () => {
  it("accepts only the exact request origin and ignores spoofable host headers", () => {
    const request = new Request("https://www.hkwtia.org/api/ai/concierge", {
      method: "POST",
      headers: {
        origin: "https://www.hkwtia.org",
        host: "attacker.test",
        "x-forwarded-host": "attacker.test",
      },
    });

    expect(isSameOrigin(request, "https://www.hkwtia.org")).toBe(true);
    expect(isSameOrigin(request, "https://admin.hkwtia.org")).toBe(false);
    expect(isSameOrigin(new Request(request.url, {
      headers: {origin: "https://www.hkwtia.org.attacker.test"},
    }), "https://www.hkwtia.org")).toBe(false);
    expect(isSameOrigin(new Request(request.url), "https://www.hkwtia.org"))
      .toBe(false);
  });

  it("uses a single trusted proxy IP and rejects malformed or forwarded chains", () => {
    expect(clientIpFromHeaders(new Headers({
      "x-vercel-forwarded-for": "203.0.113.10",
    }))).toBe("203.0.113.10");
    expect(clientIpFromHeaders(new Headers({
      "x-vercel-forwarded-for": "203.0.113.10, 198.51.100.3",
    }))).toBeNull();
    expect(clientIpFromHeaders(new Headers({
      "x-vercel-forwarded-for": "203.0.113.10, 198.51.100.3",
      "x-real-ip": "203.0.113.10",
    }))).toBeNull();
    expect(clientIpFromHeaders(new Headers({
      "x-forwarded-for": "203.0.113.10",
    }))).toBeNull();
    expect(clientIpFromHeaders(new Headers({
      "x-real-ip": "not-an-ip",
    }))).toBeNull();
  });

  it("allows exactly 20 process-local requests per minute per IP", () => {
    let now = 10_000;
    const limiter = createInMemoryRateLimiter({
      limit: 20,
      windowMs: 60_000,
      now: () => now,
    });

    for (let index = 0; index < 20; index += 1) {
      expect(limiter.check("203.0.113.10")).toEqual({
        allowed: true,
        remaining: 19 - index,
        retryAfterSeconds: 0,
      });
    }
    expect(limiter.check("203.0.113.10")).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
    expect(limiter.check("203.0.113.11").allowed).toBe(true);

    now += 60_000;
    expect(limiter.check("203.0.113.10").allowed).toBe(true);
  });

  it("enforces the strict body contract and rejects the honeypot", () => {
    expect(conciergeRequestSchema.parse({
      message: "  Hello  ",
      locale: "en",
      website: "",
    })).toMatchObject({message: "Hello"});
    expect(() => conciergeRequestSchema.parse({
      message: "Hello",
      locale: "en",
      website: "https://spam.test",
    })).toThrow();
    expect(() => conciergeRequestSchema.parse({
      message: "Hello",
      locale: "en",
      profileId: "attacker-controlled",
    })).toThrow();
    expect(() => conciergeRequestSchema.parse({
      message: "x".repeat(2001),
      locale: "zh-HK",
    })).toThrow();
  });

  it("skips network verification when Turnstile is unconfigured", async () => {
    const fetchImpl = vi.fn();

    await expect(verifyTurnstile({
      secret: undefined,
      token: undefined,
      remoteIp: "203.0.113.10",
      fetchImpl,
    })).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed for missing, rejected, or malformed Turnstile proofs", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({success: false}),
      {status: 200, headers: {"content-type": "application/json"}},
    ));

    await expect(verifyTurnstile({
      secret: "turnstile-secret",
      token: undefined,
      remoteIp: "203.0.113.10",
      fetchImpl,
    })).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(verifyTurnstile({
      secret: "turnstile-secret",
      token: "proof",
      remoteIp: "203.0.113.10",
      fetchImpl,
    })).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({method: "POST"}),
    );

    fetchImpl.mockResolvedValueOnce(new Response("not-json", {status: 200}));
    await expect(verifyTurnstile({
      secret: "turnstile-secret",
      token: "proof",
      remoteIp: "203.0.113.10",
      fetchImpl,
    })).resolves.toBe(false);
  });
});
