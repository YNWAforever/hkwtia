import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  cookie: null as string | null,
  consume: vi.fn(),
  prefillFor: vi.fn(),
  remove: vi.fn(),
  deleteThrows: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "wtia_invite" && state.cookie ? {value: state.cookie} : undefined),
    delete: (arg: unknown) => { if (state.deleteThrows) throw new Error("read-only cookies"); state.remove(arg); },
  }),
}));
vi.mock("@/lib/db/repos/join-invites", () => ({joinInvitesRepository: {consume: state.consume, prefillFor: state.prefillFor}}));

import {attributeJoinInvite, inviteDefaults} from "@/lib/membership/join-invite-attribution";

const INVITE_ID = "3f0e7a52-1c7e-4a43-9a52-6f1f6f2c9b10";
const APPLICATION_ID = "8a1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8";
const member = {kind: "member", userId: "u-1", profileId: "p-1"} as never;

describe("attributeJoinInvite", () => {
  beforeEach(() => {
    state.cookie = null;
    state.deleteThrows = false;
    state.consume.mockReset();
    state.prefillFor.mockReset();
    state.remove.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("makes no repository call without a cookie", async () => {
    await attributeJoinInvite(member, APPLICATION_ID);
    expect(state.consume).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("skips a non-member actor without calling consume", async () => {
    state.cookie = INVITE_ID;
    await attributeJoinInvite({kind: "anonymous", userId: null} as never, APPLICATION_ID);
    expect(state.consume).not.toHaveBeenCalled();
  });

  it("consumes the invite and clears the cookie", async () => {
    state.cookie = INVITE_ID;
    state.consume.mockResolvedValue("consumed");
    await attributeJoinInvite(member, APPLICATION_ID);
    expect(state.consume).toHaveBeenCalledWith(member, {inviteId: INVITE_ID, applicationId: APPLICATION_ID});
    expect(state.remove).toHaveBeenCalledWith({name: "wtia_invite", path: "/"});
  });

  it("clears the cookie when the invite was superseded (not_live)", async () => {
    state.cookie = INVITE_ID;
    state.consume.mockResolvedValue("not_live");
    await expect(attributeJoinInvite(member, APPLICATION_ID)).resolves.toBeUndefined();
    expect(state.remove).toHaveBeenCalledTimes(1);
  });

  it("makes a second submit after consumption a no-op", async () => {
    state.cookie = INVITE_ID;
    state.consume.mockResolvedValue("consumed");
    await attributeJoinInvite(member, APPLICATION_ID);
    // The first attempt cleared the cookie in the browser, so the next submit carries none.
    state.cookie = null;
    state.consume.mockClear();
    await attributeJoinInvite(member, APPLICATION_ID);
    expect(state.consume).not.toHaveBeenCalled();
  });

  it("survives a stale tab that still sends the spent cookie (not_live, no throw)", async () => {
    state.cookie = INVITE_ID;
    state.consume.mockResolvedValue("not_live");
    await expect(attributeJoinInvite(member, APPLICATION_ID)).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("swallows a repository error and logs the application id only", async () => {
    state.cookie = INVITE_ID;
    state.consume.mockRejectedValue(new Error(`boom ada@example.hk ${INVITE_ID}`));
    await expect(attributeJoinInvite(member, APPLICATION_ID)).resolves.toBeUndefined();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("join_invite.attribution_failed");
    expect(logged).toContain(APPLICATION_ID);
    expect(logged).not.toContain(INVITE_ID);
    expect(logged).not.toContain("ada@example.hk");
    expect(state.remove).toHaveBeenCalledTimes(1);
  });

  it("never throws when the cookie cannot be cleared", async () => {
    state.cookie = INVITE_ID;
    state.consume.mockResolvedValue("consumed");
    state.deleteThrows = true;
    await expect(attributeJoinInvite(member, APPLICATION_ID)).resolves.toBeUndefined();
  });
});

describe("inviteDefaults", () => {
  beforeEach(() => {
    state.cookie = null;
    state.prefillFor.mockReset();
  });

  it("is empty without a cookie", async () => {
    await expect(inviteDefaults()).resolves.toEqual({});
    expect(state.prefillFor).not.toHaveBeenCalled();
  });

  it("maps name, phone and organisation, omitting empty values", async () => {
    state.cookie = INVITE_ID;
    state.prefillFor.mockResolvedValue({displayName: "Chan Tai Man", phone: null, organisation: "Acme Ltd"});
    await expect(inviteDefaults()).resolves.toEqual({displayName: "Chan Tai Man", legalName: "Acme Ltd", companyDisplayName: "Acme Ltd"});
  });

  it("maps the phone to the WhatsApp number default", async () => {
    state.cookie = INVITE_ID;
    state.prefillFor.mockResolvedValue({displayName: null, phone: "+85291234567", organisation: null});
    await expect(inviteDefaults()).resolves.toEqual({whatsappNumber: "+85291234567"});
  });

  it("is empty for a spent invite and when the read fails", async () => {
    state.cookie = INVITE_ID;
    state.prefillFor.mockResolvedValue(null);
    await expect(inviteDefaults()).resolves.toEqual({});
    state.prefillFor.mockRejectedValue(new Error("db"));
    await expect(inviteDefaults()).resolves.toEqual({});
  });
});
