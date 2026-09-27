import {describe, expect, it, vi} from "vitest";

import {parseLoginDestination} from "@/lib/auth/login-destination";
import {resolveLogin} from "@/lib/auth/login-resolution";

function deps(sessionId: string | null, role: "member" | "staff" | "superadmin" | null) {
  return {
    session: vi.fn(async () => sessionId ? {user: {id: sessionId}} : null),
    resolveProfile: vi.fn(async () => role ? {role} : null),
  };
}

describe("login resolution", () => {
  it("preserves the existing ExCo admin role", async () => {
    const result = await resolveLogin({intent: "admin", path: "/admin"}, {
      session: async () => ({user: {id: "exco-subject"}}),
      resolveProfile: async () => ({role: "exco"}),
    });
    expect(result).toEqual({kind: "allowed", destination: {intent: "admin", path: "/admin"}});
  });

  it("keeps a genuinely signed-out visitor on the sign-in form", async () => {
    const sources = deps(null, null);
    await expect(resolveLogin(parseLoginDestination(null, "member"), sources)).resolves.toEqual({kind: "signed-out"});
    expect(sources.resolveProfile).not.toHaveBeenCalled();
  });

  it("offers profile recovery for an authenticated provider subject with no application profile", async () => {
    const sources = deps("auth-subject", null);
    await expect(resolveLogin(parseLoginDestination(null, "member"), sources)).resolves.toEqual({kind: "needs-profile", intent: "member"});
    expect(sources.resolveProfile).toHaveBeenCalledWith("auth-subject");
  });

  it("allows a member to reach portal renewal independent of membership expiry", async () => {
    await expect(resolveLogin(parseLoginDestination("/portal/billing", "member"), deps("auth-subject", "member")))
      .resolves.toEqual({kind: "allowed", destination: {intent: "member", path: "/portal/billing"}});
  });

  it("allows staff and superadmin, but not a revoked member role, into the admin workspace", async () => {
    const target = parseLoginDestination("/admin/inbox", "admin");
    await expect(resolveLogin(target, deps("staff", "staff"))).resolves.toEqual({kind: "allowed", destination: target});
    await expect(resolveLogin(target, deps("superadmin", "superadmin"))).resolves.toEqual({kind: "allowed", destination: target});
    await expect(resolveLogin(target, deps("revoked", "member"))).resolves.toEqual({kind: "forbidden"});
  });

  it("reports a session or profile-store outage as unavailable, not signed out", async () => {
    const target = parseLoginDestination(null, "member");
    for (const failing of [
      {session: async () => {throw new Error("private session detail");}, resolveProfile: async () => null},
      {session: async () => ({user: {id: "subject"}}), resolveProfile: async () => {throw new Error("private database detail");}},
    ]) {
      const result = await resolveLogin(target, failing);
      expect(result).toMatchObject({kind: "unavailable"});
      if (result.kind === "unavailable") expect(result.reference).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
