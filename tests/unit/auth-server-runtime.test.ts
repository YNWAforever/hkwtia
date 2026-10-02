import {beforeEach, describe, expect, it, vi} from "vitest";

const authState = vi.hoisted(() => ({
  getSession: vi.fn(),
  cookie: "",
  authorization: "",
}));

vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: vi.fn(() => ({getSession: authState.getSession})),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({
    cookie: authState.cookie,
    ...(authState.authorization ? {authorization: authState.authorization} : {}),
  })),
}));

describe("Neon Auth server session runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    authState.getSession.mockReset();
    authState.cookie = "__Secure-neon-auth.session_token=synthetic-credential";
    authState.authorization = "";
  });

  it.each(["", "NEXT_LOCALE=zh-HK", "role=superadmin; profileId=forged"])(
    "returns signed out without a provider read for an absent Auth credential (%s)",
    async (cookie) => {
      authState.cookie = cookie;
      // An unrelated cookie must never reach even a provider returning a user.
      authState.getSession.mockResolvedValue({data: {user: {id: "user-a"}}, error: null});
      const {getSession} = await import("@/lib/auth/server");

      await expect(getSession()).resolves.toBeNull();
      expect(authState.getSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    "__Secure-neon-auth.session_token=forged",
    "__Secure-neon-auth.local.session_data=forged",
    "__Secure-neon-auth.session_challenge=forged",
  ])("still asks the provider to validate an Auth cookie (%s)", async (cookie) => {
    authState.cookie = cookie;
    authState.getSession.mockResolvedValue({data: null, error: null});
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).resolves.toBeNull();
    expect(authState.getSession).toHaveBeenCalledWith({query: {disableCookieCache: "true", disableRefresh: "true"}});
  });

  it("does not locally trust an Authorization header", async () => {
    authState.cookie = "";
    authState.authorization = "Bearer synthetic-untrusted";
    authState.getSession.mockResolvedValue({data: null, error: null});
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).resolves.toBeNull();
    expect(authState.getSession).toHaveBeenCalledWith({query: {disableCookieCache: "true", disableRefresh: "true"}});
  });

  it("disables Neon cookie cache and refresh when reading the session", async () => {
    authState.getSession.mockResolvedValue({data: {user: {id: "user-a"}}, error: null});
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).resolves.toEqual({user: {id: "user-a"}});
    expect(authState.getSession).toHaveBeenCalledWith({query: {disableCookieCache: "true", disableRefresh: "true"}});
  });

  it("treats the exact Next cookie-mutation failure as signed out", async () => {
    authState.getSession.mockRejectedValue(new Error("Cookies can only be modified in a Server Action or Route Handler."));
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).resolves.toBeNull();
  });

  it("accepts the Next cookie-mutation error with its diagnostic suffix", async () => {
    authState.getSession.mockRejectedValue(new Error("Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/messages/next-request-in-redirect"));
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).resolves.toBeNull();
  });

  it("rethrows unrelated thrown errors", async () => {
    const failure = new Error("neon auth unavailable");
    authState.getSession.mockRejectedValue(failure);
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).rejects.toBe(failure);
  });

  it.each([
    new Error("neon result failed"),
    "neon result failed",
  ])("surfaces a non-null SDK result.error (%s)", async (failure) => {
    authState.getSession.mockResolvedValue({data: null, error: failure});
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).rejects.toThrow("neon result failed");
  });

  it("treats an exact cookie-mutation result.error as signed out", async () => {
    authState.getSession.mockResolvedValue({data: null, error: "Cookies can only be modified in a Server Action or Route Handler."});
    const {getSession} = await import("@/lib/auth/server");

    await expect(getSession()).resolves.toBeNull();
  });

  it.each([
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
  ])("fails closed in production when %s is missing", async (missingKey) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "neon-cookie-secret");
    vi.stubEnv(missingKey, "");

    await expect(import("@/lib/auth/server")).rejects.toThrow(missingKey);
  });
});
