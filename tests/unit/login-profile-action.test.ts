import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({session: null as unknown, sessionError: null as Error | null, provision: vi.fn(), destination: ""}));
vi.mock("@/lib/auth/server", () => ({getSession: async () => {
  if (state.sessionError) throw state.sessionError;
  return state.session;
}}));
vi.mock("@/lib/db/repos/profile-identities", () => ({profileIdentityRepository: {provisionMember: (...args: unknown[]) => state.provision(...args)}}));
vi.mock("next/navigation", () => ({redirect: (path: string) => {state.destination = path; throw new Error("NEXT_REDIRECT");}}));
import {provisionMemberProfileAction} from "@/app/[locale]/member-login/provision-action";

describe("member profile creation action", () => {
  beforeEach(() => {state.session = null; state.sessionError = null; state.destination = ""; state.provision.mockReset();});
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
  it("returns a verified new profile to its validated Join plan", async () => {
    state.session = {user: {id: "real-subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockResolvedValue({kind: "ready", identity: {profileId: "real-subject", role: "member"}});
    const next = "/join?plan=startup&application=1a538745-848b-448f-94d6-3b6a92f4e891";
    await expect(provisionMemberProfileAction("zh-HK", next)).rejects.toThrow("NEXT_REDIRECT");
    expect(state.destination).toBe(`/zh${next}`);
  });

  it("rejects a tampered profile return destination", async () => {
    state.session = {user: {id: "real-subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockResolvedValue({kind: "ready", identity: {profileId: "real-subject", role: "member"}});
    await expect(provisionMemberProfileAction("en", "/admin")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.destination).toBe("/join");
  });
  it("never links a different subject with the same email", async () => {
    state.session = {user: {id: "new-subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockResolvedValue({kind: "conflict"});
    await expect(provisionMemberProfileAction("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.destination).toBe("/member-login?profile=conflict");
  });
  it("does not expose database errors or route them as signed out", async () => {
    state.session = {user: {id: "subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockRejectedValue(Object.assign(new Error("secret-db-url"), {cause: Object.assign(new Error("private-sql"), {code: "42703"})}));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(provisionMemberProfileAction("en")).rejects.toThrow("NEXT_REDIRECT");
    const destination = new URL(state.destination, "https://example.test");
    expect(destination.pathname).toBe("/member-login");
    expect(destination.searchParams.get("profile")).toBe("unavailable");
    expect(destination.searchParams.get("reference")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({event: "member_profile_provision_unavailable", stage: "provision", sqlstate: "42703", reference: destination.searchParams.get("reference")});
    expect(String(log.mock.calls[0]?.[0])).not.toContain("secret-db-url");
    expect(String(log.mock.calls[0]?.[0])).not.toContain("private-sql");
    log.mockRestore();
  });
  it("keeps a validated Join continuation on an unavailable retry with the same log reference", async () => {
    state.session = {user: {id: "subject", email: "test@example.test", emailVerified: true}};
    state.provision.mockRejectedValue(new Error("private-db-detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const next = "/join?plan=corporate";
    try {
      await expect(provisionMemberProfileAction("en", next)).rejects.toThrow("NEXT_REDIRECT");
      const target = new URL(state.destination, "https://example.test");
      expect(target.searchParams.get("next")).toBe(next);
      expect(target.searchParams.get("reference")).toBe(JSON.parse(String(log.mock.calls[0]?.[0])).reference);
      expect(state.destination).not.toContain("private-db-detail");
    } finally {
      log.mockRestore();
    }
  });
  it("distinguishes a session-read failure without exposing its detail", async () => {
    state.sessionError = new Error("private-auth-token");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(provisionMemberProfileAction("en")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.provision).not.toHaveBeenCalled();
    const destination = new URL(state.destination, "https://example.test");
    expect(destination.searchParams.get("profile")).toBe("unavailable");
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({event: "member_profile_provision_unavailable", stage: "session", reference: destination.searchParams.get("reference")});
    expect(String(log.mock.calls[0]?.[0])).not.toContain("private-auth-token");
    log.mockRestore();
  });
});
