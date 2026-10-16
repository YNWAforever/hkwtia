import {describe, expect, it, vi} from "vitest";

const auth = vi.hoisted(() => ({getSession: vi.fn()}));
const profile = vi.hoisted(() => ({resolve: vi.fn()}));
vi.mock("@/lib/auth/server", () => auth);
vi.mock("@/lib/db/repos/profile-identities", () => ({profileIdentityRepository: profile}));

import {resolveCurrentLogin} from "@/lib/auth/login-resolution-server";

describe("current login resolution", () => {
  it("keeps a valid provider session without a profile separate from signed-out", async () => {
    auth.getSession.mockResolvedValueOnce({user: {id: "verified-subject"}});
    profile.resolve.mockResolvedValueOnce(null);
    await expect(resolveCurrentLogin({intent: "member", path: "/portal"})).resolves.toEqual({kind: "needs-profile", intent: "member"});
    expect(profile.resolve).toHaveBeenCalledWith("verified-subject");
  });
  it("keeps session read failures separate from signed-out", async () => {
    auth.getSession.mockRejectedValueOnce(new Error("DATABASE_URL=sensitive"));
    const result = await resolveCurrentLogin({intent: "admin", path: "/admin"});
    expect(result.kind).toBe("unavailable");
    expect(result).not.toHaveProperty("message");
  });
});
