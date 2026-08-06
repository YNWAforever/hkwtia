import {describe, expect, it} from "vitest";

import {createSeatService, type SeatServiceDependencies} from "@/lib/db/repos/seats";
import type {Actor} from "@/lib/membership/lifecycle";
import {completeApplication} from "@/lib/membership/onboarding";
import {getDashboard, type PortalQueryDependencies} from "@/lib/portal/queries";
import {updateProfile, type PortalCommandDependencies} from "@/lib/portal/command-core";

const member = {kind: "member", userId: "auth-1", profileId: "member-1"} as const;

describe("profile-backed member identity", () => {
  it("uses profileId for portal profile reads and writes", async () => {
    const ids: string[] = [];
    const profile = {id: "member-1", displayName: "Member", phone: null, jobTitle: null, locale: "en", onboardingState: "profile", directoryVisible: false};
    const dependencies = {
      profiles: {
        async getById(_actor: Actor, id: string) { ids.push(id); return profile; },
        async update(_actor: Actor, id: string, input: Record<string, unknown>) { ids.push(id); return {...profile, ...input}; },
      },
      memberships: {async list() { return [{id: "membership-1", ownerUserId: "member-1", companyId: null, applicationId: "application-1", planCode: "community" as const, status: "active" as const, seatLimit: 1}]; }},
      companies: {async getById() { return null; }},
      getCompanyRole: async () => null,
    } as unknown as PortalQueryDependencies & PortalCommandDependencies;

    await getDashboard(member, dependencies);
    await updateProfile(member, {displayName: "Updated"}, dependencies);

    expect(ids).toEqual(["member-1", "member-1"]);
  });

  it("uses profileId for onboarding profile and personal membership ownership", async () => {
    const ensuredIds: string[] = [];
    const membershipInputs: Record<string, unknown>[] = [];
    const dependencies = {
      profiles: {async ensure(_actor: Actor, input: {id: string}) { ensuredIds.push(input.id); return input; }},
      applications: {
        async getById() { return null; },
        async create() { return {id: "application-1", applicantUserId: "member-1", companyId: null, planCode: "community" as const, currentStep: "profile" as const, status: "draft" as const}; },
        async update(_actor: Actor, _id: string, input: Record<string, unknown>) { return {id: "application-1", applicantUserId: "member-1", companyId: null, planCode: "community" as const, currentStep: "complete" as const, status: input.status as "completed"}; },
      },
      memberships: {
        async getByApplicationId() { return null; },
        async create(_actor: Actor, input: Record<string, unknown>) { membershipInputs.push(input); return {id: "membership-1", applicationId: "application-1", ownerUserId: input.ownerUserId as string, companyId: null, planCode: "community" as const, status: "active" as const, seatLimit: 1}; },
      },
    };

    await completeApplication(member, {plan: "community", profile: {displayName: "Member"}, company: null}, dependencies);

    expect(ensuredIds).toEqual(["member-1"]);
    expect(membershipInputs).toMatchObject([{ownerUserId: "member-1"}]);
  });

  it("uses profileId for seat management and invitation acceptance rows", async () => {
    const members = [{id: "owner-row", companyId: "company-1", userId: "owner-profile", role: "owner" as const, revokedAt: null}];
    const invitations: Array<Record<string, unknown>> = [];
    const observed: Record<string, unknown>[] = [];
    const dependencies = {
      getCompany: async () => ({id: "company-1", seatLimit: 3}),
      getCompanyById: async () => ({id: "company-1", seatLimit: 3}),
      listMembers: async () => members,
      listPendingInvitations: async () => invitations,
      insertInvitation: async (input: Record<string, unknown>) => { observed.push(input); const row = {...input, id: "invitation-1", acceptedAt: null, revokedAt: null}; invitations.push(row); return row; },
      getInvitationByDigest: async () => invitations[0] ?? null,
      getProfileByUserId: async (_actor: Actor, id: string) => ({id, email: "invitee@example.com", displayName: "Invitee"}),
      ensureProfile: async (_actor: Actor, id: string) => { observed.push({ensuredProfileId: id}); },
      insertMember: async (input: Record<string, unknown>) => { observed.push(input); return {...input, id: "member-row", joinedAt: new Date(), revokedAt: null}; },
      markInvitationAccepted: async (_id: string, id: string) => { observed.push({acceptedByUserId: id}); return invitations[0]; },
      withCompanyTransaction: async (_companyId: string, fn: (transaction: unknown) => Promise<unknown>) => fn({}),
    } as unknown as SeatServiceDependencies;
    const service = createSeatService(dependencies);
    const owner = {kind: "member", userId: "owner-auth", profileId: "owner-profile"} as const;
    const invitee = {kind: "member", userId: "invitee-auth", profileId: "invitee-profile"} as const;

    const invitation = await service.inviteSeat(owner, "company-1", {email: "invitee@example.com"});
    await service.acceptSeatInvitation(invitee, invitation.token);

    expect(observed).toEqual(expect.arrayContaining([
      expect.objectContaining({inviterUserId: "owner-profile"}),
      expect.objectContaining({userId: "invitee-profile"}),
      {acceptedByUserId: "invitee-profile"},
    ]));
  });
});
