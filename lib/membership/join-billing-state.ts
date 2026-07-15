import "server-only";

import {applicationsRepository} from "@/lib/db/repos/applications";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import type {Actor, MembershipRecord} from "@/lib/membership/lifecycle";

type ApplicationRecord = Readonly<{id: string; planCode: string; status: string}>;
type Dependencies = Readonly<{
  memberships: {getById(actor: Actor, membershipId: string): Promise<MembershipRecord | null>};
  applications: {getById(actor: Actor, applicationId: string): Promise<ApplicationRecord | null>};
}>;

const defaultDependencies = {
  memberships: membershipsRepository,
  applications: applicationsRepository,
} as Dependencies;

export type PendingJoinBillingState = Readonly<{
  actor: Extract<Actor, {kind: "member"}>;
  membership: MembershipRecord & {applicationId: string; status: "pending_payment"};
  application: ApplicationRecord;
}>;

export async function loadPendingJoinBillingState(
  actor: Actor | null,
  membershipId: string | undefined,
  dependencies: Dependencies = defaultDependencies,
): Promise<PendingJoinBillingState | null> {
  if (!actor || actor.kind !== "member" || !membershipId) return null;
  try {
    const membership = await dependencies.memberships.getById(actor, membershipId);
    if (!membership || membership.status !== "pending_payment" || !membership.applicationId) return null;
    const application = await dependencies.applications.getById(actor, membership.applicationId);
    if (!application || application.id !== membership.applicationId) return null;
    if (application.status !== "pending_payment" || application.planCode !== membership.planCode) return null;
    return {
      actor,
      membership: membership as PendingJoinBillingState["membership"],
      application,
    };
  } catch {
    return null;
  }
}
