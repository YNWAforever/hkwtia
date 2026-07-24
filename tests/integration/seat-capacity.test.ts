import {describe, expect, it} from "vitest";
import {createHash} from "node:crypto";
import type {Actor} from "@/lib/membership/lifecycle";
import {createSeatService, type SeatServiceDependencies} from "@/lib/db/repos/seats";

const actor = (userId: string): Actor => ({kind: "member", userId, profileId: userId});
type TestRow = {id: string; [key: string]: unknown};
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

describe("seat capacity concurrency", () => {
  it("allows one of two concurrent acceptance attempts when only one seat remains", async () => {
    const members: TestRow[] = [{id: "owner", companyId: "company-a", userId: "owner", role: "owner", revokedAt: null}];
    const invitations: TestRow[] = [
      {id: "i-a", companyId: "company-a", invitedEmail: "a@example.com", role: "member", tokenDigest: digest("token-a"), acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 60_000)},
      {id: "i-b", companyId: "company-a", invitedEmail: "b@example.com", role: "member", tokenDigest: digest("token-b"), acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 60_000)},
    ];
    let locked = false;
    const deps = {getCompany: async () => ({id: "company-a", seatLimit: 2}), listMembers: async () => members, listPendingInvitations: async () => invitations, getProfileByUserId: async (_actor: Actor, userId: string) => ({id: userId, email: `${userId}@example.com`, displayName: userId}), getInvitationByDigest: async (tokenDigest: string) => invitations.find((row) => row.tokenDigest === tokenDigest) ?? null, markInvitationAccepted: async (id: string, userId: string) => {const row = invitations.find((candidate) => candidate.id === id); if (row) Object.assign(row, {acceptedAt: new Date(), acceptedByUserId: userId}); return row;}, insertMember: async (input: unknown) => {const row = {...(input as Record<string, unknown>), id: `member-${members.length + 1}`, revokedAt: null}; members.push(row); return row;}, getMember: async () => null, withCompanyTransaction: async (_companyId: string, fn: unknown) => { const callback = fn as (transaction: unknown) => Promise<unknown>;while (locked) await new Promise((resolve) => setTimeout(resolve, 1)); locked = true; try {return await callback({});} finally {locked = false;}}} as unknown as SeatServiceDependencies;
    const service = createSeatService(deps);
    const [first, second] = await Promise.allSettled([service.acceptSeatInvitation(actor("a"), "token-a"), service.acceptSeatInvitation(actor("b"), "token-b")]);
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = first.status === "rejected" ? first.reason : second.status === "rejected" ? second.reason : new Error("expected rejection");
    expect(rejected).toHaveProperty("message", "SEAT_LIMIT_REACHED");
  });
});
