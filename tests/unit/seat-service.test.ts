import {describe, expect, it} from "vitest";

import type {Actor} from "@/lib/membership/lifecycle";
import {createSeatService, type SeatServiceDependencies} from "@/lib/db/repos/seats";

type Role = "owner" | "admin" | "member";
type TestRow = {id: string; [key: string]: unknown};
const actor = (userId: string): Actor => ({kind: "member", userId});

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const members: TestRow[] = [{id: "m-owner", companyId: "company-a", userId: "owner", role: "owner" as Role, revokedAt: null}];
  const invitations: TestRow[] = [];
  const profiles = new Map([
    ["owner", {id: "owner", email: "owner@example.com", displayName: "Owner"}],
    ["member", {id: "member", email: "member@example.com", displayName: "Member"}],
    ["other", {id: "other", email: "other@example.com", displayName: "Other"}],
  ]);
  return {
    getCompany: async () => ({id: "company-a", seatLimit: 3}),
    listMembers: async () => members,
    listPendingInvitations: async () => invitations,
    getProfileByUserId: async (_actor: Actor, userId: string) => profiles.get(userId) ?? null,
    insertInvitation: async (input: unknown) => { const row = {...(input as Record<string, unknown>), id: `inv-${invitations.length + 1}`, acceptedAt: null, revokedAt: null}; invitations.push(row); return row; },
    getInvitationByDigest: async (tokenDigest: string) => invitations.find((candidate) => candidate.tokenDigest === tokenDigest) ?? null,
    getInvitation: async (invitationId: string) => invitations.find((candidate) => candidate.id === invitationId) ?? null,
    updateInvitation: async (invitationId: string, input: unknown) => { const row = invitations.find((candidate) => candidate.id === invitationId); if (row) Object.assign(row, input as Record<string, unknown>); return row ?? null; },
    markInvitationAccepted: async (id: string, userId: string) => { const row = invitations.find((candidate) => candidate.id === id); if (row) Object.assign(row, {acceptedAt: new Date(), acceptedByUserId: userId}); return row; },
    insertMember: async (input: unknown) => { const row = {...(input as Record<string, unknown>), id: `m-${members.length + 1}`, joinedAt: new Date(), revokedAt: null}; members.push(row); return row; },
    getMember: async (memberId: string) => members.find((candidate) => candidate.id === memberId) ?? null,
    updateMember: async (id: string, input: unknown) => { const row = members.find((candidate) => candidate.id === id); if (row) Object.assign(row, input as Record<string, unknown>); return row ?? null; },
    withCompanyTransaction: async (_companyId: string, fn: unknown) => (fn as (transaction: unknown) => Promise<unknown>)({}),
    ...overrides,
  } as unknown as SeatServiceDependencies;
}

describe("transactional company seat service", () => {
  it("rejects invites when active members plus pending invitations reach the seat limit", async () => {
    const deps = makeDependencies({getCompany: async () => ({id: "company-a", seatLimit: 2}), listMembers: async () => [{id: "m-owner", companyId: "company-a", userId: "owner", role: "owner", revokedAt: null}], listPendingInvitations: async () => [{id: "pending", companyId: "company-a"}]});
    await expect(createSeatService(deps).inviteSeat(actor("owner"), "company-a", {email: "new@example.com"})).rejects.toThrow("SEAT_LIMIT_REACHED");
  });
  it("normalizes invitation email and rejects an authenticated user with a different email", async () => {
    const service = createSeatService(makeDependencies());
    const invitation = await service.inviteSeat(actor("owner"), "company-a", {email: "  Invitee@Example.COM "});
    expect(invitation.invitedEmail).toBe("invitee@example.com");
    await expect(service.acceptSeatInvitation(actor("other"), invitation.token)).rejects.toThrow("INVITATION_EMAIL_MISMATCH");
  });
  it("accepts an invitee without requiring existing company membership", async () => {
    const deps = makeDependencies({
      getCompany: async (currentActor: Actor) => currentActor.userId === "owner" ? {id: "company-a", seatLimit: 3} : null,
      getCompanyById: async () => ({id: "company-a", seatLimit: 3}),
    });
    const service = createSeatService(deps);
    const invitation = await service.inviteSeat(actor("owner"), "company-a", {email: "member@example.com"});
    await expect(service.acceptSeatInvitation(actor("member"), invitation.token)).resolves.toMatchObject({userId: "member", companyId: "company-a"});
  });
  it("rejects duplicate invitation acceptance", async () => {
    const service = createSeatService(makeDependencies());
    const invitation = await service.inviteSeat(actor("owner"), "company-a", {email: "member@example.com"});
    await expect(service.acceptSeatInvitation(actor("member"), invitation.token)).resolves.toMatchObject({userId: "member"});
    await expect(service.acceptSeatInvitation(actor("member"), invitation.token)).rejects.toThrow("INVITATION_ALREADY_ACCEPTED");
  });
  it("protects the last owner and prevents admins from assigning owners", async () => {
    const deps = makeDependencies({getCompany: async () => ({id: "company-a", seatLimit: 5}), listMembers: async () => [{id: "m-owner", companyId: "company-a", userId: "owner", role: "owner", revokedAt: null}]});
    const service = createSeatService(deps);
    await expect(service.revokeSeat(actor("owner"), "m-owner")).rejects.toThrow("LAST_OWNER_PROTECTION");
    await expect(service.changeSeatRole(actor("owner"), "m-owner", "member")).rejects.toThrow("LAST_OWNER_PROTECTION");
    const adminDeps = makeDependencies({getCompany: async () => ({id: "company-a", seatLimit: 5}), listMembers: async () => [{id: "m-owner", companyId: "company-a", userId: "owner", role: "owner", revokedAt: null}, {id: "m-admin", companyId: "company-a", userId: "admin", role: "admin", revokedAt: null}]});
    await expect(createSeatService(adminDeps).changeSeatRole(actor("admin"), "m-owner", "member")).rejects.toThrow("ROLE_POLICY");
  });
  it("allows owners and admins to manage seats but denies ordinary members", async () => {
    const deps = makeDependencies({getCompany: async () => ({id: "company-a", seatLimit: 5}), listMembers: async () => [{id: "m-owner", companyId: "company-a", userId: "owner", role: "owner", revokedAt: null}, {id: "m-admin", companyId: "company-a", userId: "admin", role: "admin", revokedAt: null}, {id: "m-member", companyId: "company-a", userId: "member", role: "member", revokedAt: null}]});
    await expect(createSeatService(deps).inviteSeat(actor("member"), "company-a", {email: "new@example.com"})).rejects.toThrow("FORBIDDEN");
    await expect(createSeatService(deps).inviteSeat(actor("admin"), "company-a", {email: "new@example.com"})).resolves.toBeTruthy();
  });
  it("returns the existing pending invitation on duplicate submission", async () => {
    const deps = makeDependencies({getCompany: async () => ({id: "company-a", seatLimit: 5})});
    const service = createSeatService(deps);
    const first = await service.inviteSeat(actor("owner"), "company-a", {email: "same@example.com"});
    const second = await service.inviteSeat(actor("owner"), "company-a", {email: " same@example.com "});
    expect(second.id).toBe(first.id);
    expect(second.token).toBe("");
  });
  it("rechecks the target role inside the transaction before an admin mutation", async () => {
    let reads = 0;
    const deps = makeDependencies({
      getCompany: async () => ({id: "company-a", seatLimit: 5}),
      listMembers: async () => [{id: "m-owner", companyId: "company-a", userId: "owner", role: "owner", revokedAt: null}, {id: "m-admin", companyId: "company-a", userId: "admin", role: "admin", revokedAt: null}, {id: "m-target", companyId: "company-a", userId: "member", role: "member", revokedAt: null}],
      getMember: async () => { reads += 1; return {id: "m-target", companyId: "company-a", userId: "member", role: reads === 1 ? "member" : "owner", revokedAt: null}; },
    });
    await expect(createSeatService(deps).changeSeatRole(actor("admin"), "m-target", "member")).rejects.toThrow("ROLE_POLICY");
  });
  it("revokes a pending invitation without changing capacity rows", async () => {
    const deps = makeDependencies({getCompany: async () => ({id: "company-a", seatLimit: 5})}) as SeatServiceDependencies & {getInvitation: NonNullable<SeatServiceDependencies["getInvitation"]>; updateInvitation: NonNullable<SeatServiceDependencies["updateInvitation"]>};
    const service = createSeatService(deps);
    const invitation = await service.inviteSeat(actor("owner"), "company-a", {email: "cancel@example.com"});
    await expect(service.revokeInvitation(actor("owner"), invitation.id)).resolves.toBeUndefined();
  });
});
