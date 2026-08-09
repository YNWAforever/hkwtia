import {beforeEach, describe, expect, it, vi} from "vitest";

const authState = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: vi.fn(() => ({getSession: authState.getSession})),
}));

describe("Neon Auth server session runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    authState.getSession.mockReset();
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
