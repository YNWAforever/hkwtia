import type {Actor} from "@/lib/membership/lifecycle";
import {createFakeRepositories as makeRepositories} from "@/lib/db/repos/fakes";

export const actorFor = (userId: string, companyRoles?: Readonly<Record<string, "owner" | "admin" | "member">>): Actor => ({
  kind: "member",
  userId,
  companyRoles,
});

export const anonymousActor = (): Actor => ({kind: "anonymous", userId: null});

export const systemActor = (): Actor => ({kind: "system", userId: null, source: "stripe-webhook"});

export const membershipOwnedBy = (companyId: string, id = "membership-company-b") => ({
  id,
  ownerUserId: null,
  companyId,
  planCode: "corporate" as const,
  status: "active" as const,
  seatLimit: 10,
});

export function createFakeRepositories() {
  return makeRepositories({
    memberships: [
      membershipOwnedBy("company-a", "membership-company-a"),
      membershipOwnedBy("company-b", "membership-company-b"),
    ],
    companyMembers: [
      {id: "member-a", companyId: "company-a", userId: "user-a", role: "member", revokedAt: null},
    ],
  });
}
