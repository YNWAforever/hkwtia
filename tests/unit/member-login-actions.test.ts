import {beforeEach, describe, expect, it, vi} from "vitest";

const signInMagicLink = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({auth: {signIn: {magicLink: signInMagicLink}}}));

const checkAuthSend = vi.hoisted(() => vi.fn(() => ({allowed: true, retryAfterSeconds: 0})));
vi.mock("@/lib/auth/rate-limit", () => ({checkAuthSend}));

vi.mock("next/headers", () => ({headers: vi.fn(async () => new Headers({"x-vercel-forwarded-for": "203.0.113.9"}))}));

import {requestMemberLoginLink} from "@/app/[locale]/member-login/actions";

describe("requestMemberLoginLink", () => {
  beforeEach(() => {
    signInMagicLink.mockReset();
    signInMagicLink.mockResolvedValue({});
    checkAuthSend.mockReset();
    checkAuthSend.mockReturnValue({allowed: true, retryAfterSeconds: 0});
    process.env.APP_URL = "https://member-login.example.test";
  });

  it("rejects an invalid email without calling the provider", async () => {
    const result = await requestMemberLoginLink({email: "not-an-email", next: null}, "en");
    expect(result).toEqual({ok: false, error: "invalid_email"});
    expect(signInMagicLink).not.toHaveBeenCalled();
  });

  it("rejects a next value that is not a real Portal continuation, without calling the provider", async () => {
    const result = await requestMemberLoginLink({email: "a@example.com", next: "/admin"}, "en");
    expect(result).toEqual({ok: false, error: "invalid_continuation"});
    expect(signInMagicLink).not.toHaveBeenCalled();
  });

  it("calls the shared magic-link provider with a member-login callback and a validated continuation", async () => {
    const result = await requestMemberLoginLink({email: "a@example.com", next: "/portal/billing"}, "en");
    expect(result).toEqual({ok: true});
    expect(signInMagicLink).toHaveBeenCalledWith(expect.objectContaining({email: "a@example.com"}));
    const call = signInMagicLink.mock.calls[0][0];
    expect(call.callbackURL).toMatch(/^https?:\/\/.+\/member-login\?next=%2Fportal%2Fbilling$/);
  });

  it("propagates a rate-limit rejection without calling the provider", async () => {
    checkAuthSend.mockReturnValueOnce({allowed: false, retryAfterSeconds: 120});
    const result = await requestMemberLoginLink({email: "a@example.com", next: null}, "en");
    expect(result).toEqual({ok: false, error: "rate_limited"});
    expect(signInMagicLink).not.toHaveBeenCalled();
  });

  it("treats a null next as the default /portal continuation", async () => {
    const result = await requestMemberLoginLink({email: "a@example.com", next: null}, "en");
    expect(result).toEqual({ok: true});
    const call = signInMagicLink.mock.calls[0][0];
    expect(call.callbackURL).toMatch(/\/member-login\?next=%2Fportal$/);
  });

  it("reports a provider error without leaking the underlying failure", async () => {
    signInMagicLink.mockResolvedValueOnce({error: {message: "boom"}});
    const result = await requestMemberLoginLink({email: "a@example.com", next: null}, "en");
    expect(result).toEqual({ok: false, error: "provider_error"});
  });

  it("reports a provider error when the provider call throws", async () => {
    signInMagicLink.mockRejectedValueOnce(new Error("network down"));
    const result = await requestMemberLoginLink({email: "a@example.com", next: null}, "en");
    expect(result).toEqual({ok: false, error: "provider_error"});
  });
});
