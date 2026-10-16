import {beforeEach, describe, expect, it, vi} from "vitest";

const signInMagicLink = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/server", () => ({auth: {signIn: {magicLink: signInMagicLink}}}));
const checkAuthSend = vi.hoisted(() => vi.fn(() => ({allowed: true, retryAfterSeconds: 0})));
vi.mock("@/lib/auth/rate-limit", () => ({checkAuthSend}));
vi.mock("next/headers", () => ({headers: vi.fn(async () => new Headers({"x-vercel-forwarded-for": "203.0.113.9"}))}));

import {requestAdminLoginLink} from "@/app/[locale]/member-login/actions";

describe("requestAdminLoginLink", () => {
  beforeEach(() => {
    signInMagicLink.mockReset();
    signInMagicLink.mockResolvedValue({});
    checkAuthSend.mockReset();
    checkAuthSend.mockReturnValue({allowed: true, retryAfterSeconds: 0});
    process.env.APP_URL = "https://staff-login.example.test";
  });

  it("uses the same provider and limiter with a validated staff callback", async () => {
    const result = await requestAdminLoginLink({email: "staff@example.test", next: "/admin/members?q=Acme"}, "zh-HK");
    expect(result).toEqual({ok: true});
    expect(checkAuthSend).toHaveBeenCalledTimes(1);
    const callback = new URL(signInMagicLink.mock.calls[0][0].callbackURL);
    expect(callback.pathname).toBe("/zh/admin-login");
    expect(callback.searchParams.get("next")).toBe("/admin/members?q=Acme");
  });

  it("rejects an external continuation before sending", async () => {
    await expect(requestAdminLoginLink({email: "staff@example.test", next: "//evil.example"}, "en"))
      .resolves.toEqual({ok: false, error: "invalid_continuation"});
    expect(signInMagicLink).not.toHaveBeenCalled();
  });
});
