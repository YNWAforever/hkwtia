import {beforeEach, describe, expect, it, vi} from "vitest";

const jar = vi.hoisted(() => ({value: undefined as string | undefined}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({get: (name: string) => (name === "wtia_invite" && jar.value !== undefined ? {name, value: jar.value} : undefined)}),
}));

import {INVITE_COOKIE_NAME, inviteCookieOptions, readInviteCookie} from "@/lib/membership/join-invite-cookie";

describe("join invite cookie", () => {
  beforeEach(() => { jar.value = undefined; });

  it("is a httpOnly secure lax cookie that expires with the invite", () => {
    const expiresAt = new Date("2026-11-01T00:00:00.000Z");
    expect(INVITE_COOKIE_NAME).toBe("wtia_invite");
    expect(inviteCookieOptions(expiresAt)).toEqual({httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt});
  });

  it("reads a uuid and nothing else", async () => {
    jar.value = "3f0e7a52-1c7e-4a43-9a52-6f1f6f2c9b10";
    await expect(readInviteCookie()).resolves.toBe("3f0e7a52-1c7e-4a43-9a52-6f1f6f2c9b10");
    jar.value = "not-a-uuid";
    await expect(readInviteCookie()).resolves.toBeNull();
    jar.value = undefined;
    await expect(readInviteCookie()).resolves.toBeNull();
  });
});
