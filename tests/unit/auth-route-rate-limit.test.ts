import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {authPathOf, checkAuthSend, rateLimitAuthRequest} from "@/lib/auth/rate-limit";
import {asAsyncRateLimiter, createInMemoryRateLimiter} from "@/lib/security/rate-limit";

function post(path: string, body?: unknown, ip = "203.0.113.10"): Request {
  return new Request(`https://hkwtia.test/api/auth/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? {"x-vercel-forwarded-for": ip} : {}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
}

function limiters(overrides: Parameters<typeof rateLimitAuthRequest>[1] = {}) {
  return {
    emailLimiter: asAsyncRateLimiter(createInMemoryRateLimiter({limit: 2, windowMs: 60_000})),
    sendIpLimiter: asAsyncRateLimiter(createInMemoryRateLimiter({limit: 3, windowMs: 60_000})),
    credentialLimiter: asAsyncRateLimiter(createInMemoryRateLimiter({limit: 2, windowMs: 60_000})),
    ...overrides,
  };
}

describe("auth path extraction", () => {
  it.each([
    ["https://x.test/api/auth/sign-in/magic-link", "sign-in/magic-link"],
    ["https://x.test/api/auth/sign-in/magic-link/", "sign-in/magic-link"],
    ["https://x.test/api/auth/Sign-In/Magic-Link", "sign-in/magic-link"],
    ["https://x.test/api/auth/sign-in/magic-link?x=1", "sign-in/magic-link"],
    ["https://x.test/api/other/sign-in/magic-link", null],
    ["https://x.test/api/auth/", null],
  ])("maps %s", (url, expected) => {
    expect(authPathOf(url)).toBe(expected);
  });
});

describe("auth send-path rate limiting", () => {
  // Every one of these mails an address the caller chooses. Limiting only
  // magic-link would leave equivalent amplifiers wide open.
  it.each([
    "sign-in/magic-link",
    "sign-in/email-otp",
    "sign-up/email",
    "email-otp/send-verification-otp",
  ])("limits %s by IP", async (path) => {
    const dependencies = limiters();
    const send = () => rateLimitAuthRequest(post(path, {email: `a${Math.random()}@example.test`}), dependencies);

    expect(await send()).toBeNull();
    expect(await send()).toBeNull();
    expect(await send()).toBeNull();
    const blocked = await send();

    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(blocked?.json()).resolves.toEqual({error: "RATE_LIMITED"});
  });

  it("limits one address even as the attacker rotates IPs", async () => {
    const dependencies = limiters();
    const target = "victim@example.test";
    const attempt = (ip: string) =>
      rateLimitAuthRequest(post("sign-in/magic-link", {email: target}, ip), dependencies);

    expect(await attempt("203.0.113.1")).toBeNull();
    expect(await attempt("203.0.113.2")).toBeNull();
    // Third IP, same inbox: the per-email bucket is what protects the victim.
    expect((await attempt("203.0.113.3"))?.status).toBe(429);
  });

  it("treats an address as one bucket regardless of case or padding", async () => {
    const dependencies = limiters();

    expect(await rateLimitAuthRequest(post("sign-in/magic-link", {email: "Person@Example.test"}), dependencies)).toBeNull();
    expect(await rateLimitAuthRequest(post("sign-in/magic-link", {email: "  person@example.test  "}), dependencies)).toBeNull();
    expect((await rateLimitAuthRequest(post("sign-in/magic-link", {email: "PERSON@EXAMPLE.TEST"}), dependencies))?.status).toBe(429);
  });

  it("shares one bucket for callers with no resolvable IP rather than exempting them", async () => {
    const dependencies = limiters();
    const noIp = () => rateLimitAuthRequest(
      new Request("https://hkwtia.test/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({email: `a${Math.random()}@example.test`}),
      }),
      dependencies,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) expect(await noIp()).toBeNull();
    expect((await noIp())?.status).toBe(429);
  });

  it("still charges the IP bucket when the body carries no address", async () => {
    const dependencies = limiters();
    const send = () => rateLimitAuthRequest(post("sign-in/magic-link", {}), dependencies);

    for (let attempt = 0; attempt < 3; attempt += 1) expect(await send()).toBeNull();
    expect((await send())?.status).toBe(429);
  });

  it.each([
    ["a malformed body", "not json"],
    ["no body at all", undefined],
  ])("does not throw on %s", async (_case, body) => {
    const request = new Request("https://hkwtia.test/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: {"x-vercel-forwarded-for": "203.0.113.10"},
      ...(body === undefined ? {} : {body: body as string}),
    });

    await expect(rateLimitAuthRequest(request, limiters())).resolves.toBeNull();
  });

  it("leaves the body readable by the provider handler", async () => {
    const request = post("sign-in/magic-link", {email: "person@example.test"});

    await rateLimitAuthRequest(request, limiters());

    // The clone must not have consumed it, or the provider gets an empty body.
    expect(request.bodyUsed).toBe(false);
    await expect(request.json()).resolves.toEqual({email: "person@example.test"});
  });

  it("ignores an oversized body rather than buffering it", async () => {
    const request = new Request("https://hkwtia.test/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(9_000),
        "x-vercel-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({email: "person@example.test", pad: "x".repeat(9_000)}),
    });

    // Allowed through on the IP bucket, but the address was never extracted.
    await expect(rateLimitAuthRequest(request, limiters())).resolves.toBeNull();
  });
});

describe("auth credential-path rate limiting", () => {
  it.each([
    "sign-in/email",
    "email-otp/check-verification-otp",
    "email-otp/verify-email",
  ])("limits repeated guesses at %s", async (path) => {
    const dependencies = limiters();
    const guess = () => rateLimitAuthRequest(post(path, {email: "a@example.test", password: "x"}), dependencies);

    expect(await guess()).toBeNull();
    expect(await guess()).toBeNull();
    expect((await guess())?.status).toBe(429);
  });
});

describe("auth paths that must stay untouched", () => {
  it.each([
    "sign-in/social",
    "sign-out",
    "get-session",
    "token/anonymous",
    "organization/list",
  ])("never limits %s", async (path) => {
    const dependencies = limiters();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await rateLimitAuthRequest(post(path, {email: "a@example.test"}), dependencies)).toBeNull();
    }
  });

  it("passes through when the request is not an auth route at all", async () => {
    const request = new Request("https://hkwtia.test/api/showcase/x/view", {method: "POST"});

    await expect(rateLimitAuthRequest(request, limiters())).resolves.toBeNull();
  });
});

describe("the route module", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/auth/[...path]/route.ts"), "utf8");

  it("still exports every verb the provider handler serves", () => {
    for (const verb of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      expect(source, verb).toContain(verb);
    }
  });

  it("routes POST through the limiter before the provider handler", () => {
    const guard = source.indexOf("rateLimitAuthRequest");
    const delegate = source.indexOf("handlers.POST");

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(delegate).toBeGreaterThan(guard);
  });
});

describe("the shared decision used by the /join Server Action", () => {
  // auth.signIn.magicLink fetches the upstream service directly, so /join never
  // passes through the route wrapper. Both entrypoints must share this.
  it("applies the same IP and email ceilings the route uses", async () => {
    const dependencies = limiters();
    const send = (email: string, ip: string | null = "203.0.113.10") =>
      checkAuthSend({ip, email}, dependencies);

    expect((await send("a@example.test")).allowed).toBe(true);
    expect((await send("a@example.test")).allowed).toBe(true);
    const blocked = await send("a@example.test");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("charges the IP bucket before the email bucket", async () => {
    const dependencies = limiters();

    // Three distinct addresses from one source exhausts the IP ceiling of 3,
    // so a fourth is refused even though no address has been used twice.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await checkAuthSend({ip: "198.51.100.7", email: `x${attempt}@example.test`}, dependencies)).allowed).toBe(true);
    }
    expect((await checkAuthSend({ip: "198.51.100.7", email: "fresh@example.test"}, dependencies)).allowed).toBe(false);
  });

  it("allows a send with no address once the IP bucket has room", async () => {
    expect((await checkAuthSend({ip: "198.51.100.8", email: null}, limiters())).allowed).toBe(true);
  });
});

describe("the /join Server Action shares the guard", () => {
  const source = readFileSync(resolve(process.cwd(), "app/[locale]/(join)/join/actions.ts"), "utf8");

  it("checks the limit before asking the provider to send", () => {
    const guard = source.indexOf("checkAuthSend");
    const send = source.indexOf("auth.signIn.magicLink");

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(send).toBeGreaterThan(guard);
  });

  it("reports the refusal with a localized message rather than a generic auth error", () => {
    expect(source).toContain('t("errors.rateLimited")');
  });
});