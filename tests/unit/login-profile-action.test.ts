import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({session: null as unknown, provision: vi.fn(), destination: ""}));
vi.mock("@/lib/auth/server", () => ({getSession: async () => state.session}));
vi.mock("@/lib/db/repos/profile-identities", () => ({profileIdentityRepository: {provisionMember: (...args: unknown[]) => state.provision(...args)}}));
vi.mock("next/navigation", () => ({redirect: (path: string) => {state.destination = path; throw new Error("NEXT_REDIRECT");}}));
import {provisionMemberProfileAction} from "@/app/[locale]/member-login/provision-action";

describe("member profile creation action", () => {
  beforeEach(() => {state.session = null; state.destination = ""; state.provision.mockReset();});
  it("requires a verified server session and never writes for signed-out calls", async () => {
    await expect(provisionMemberProfileAction("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.provision).not.toHaveBeenCalled();
    expect(state.destination).toBe("/member-login?profile=unverified");
  });
  it("creates only from the server subject and routes a new identity to existing Join", async () => {
    state.session = {user: {id: "real-subject", email: "test@example.test", emailVerified: true, name: "Synthetic"}};
    state.provision.mockResolvedValue({kind: "ready", identity: {profileId: "real-subject", role: "member"}});
    await expect(provisionMemberProfileAction("zh-HK")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.provision).toHaveBeenCalledWith({authUserId: "real-subject", email: "test@example.test", displayName: "Synthetic"});
    expect(state.destination).toBe("/zh/join");
  });
  it("never links a different subject with the same email", async () => {
    state.session = {user: {id: "new-subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockResolvedValue({kind: "conflict"});
    await expect(provisionMemberProfileAction("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.destination).toBe("/member-login?profile=conflict");
  });
  it("does not expose database errors or route them as signed out", async () => {
    state.session = {user: {id: "subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockRejectedValue(new Error("secret-db-url"));
    await expect(provisionMemberProfileAction("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.destination).toBe("/member-login?profile=unavailable");
  });
});
