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

// Webhook-authoritative completion projection: /join/complete must reflect the membership's
// *real* status once Stripe (or the review workflow) has moved past pending_payment, not assume
// payment is still pending. See docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md,
// WP-6 Task 13 -- Task 12 started routing Community/Patron completions here before this existed,
// which 404'd every non-pending_payment completion. Stripe's webhook only writes memberships.status,
// never membershipApplications.status, so checking application.status would reject the "active" case.
export type JoinCompletionDisplay = "processing" | "review" | "active";

export type JoinCompletionState = Readonly<{
  actor: Extract<Actor, {kind: "member"}>;
  display: JoinCompletionDisplay;
  membership: MembershipRecord & {applicationId: string};
  application: ApplicationRecord;
}>;

const completionStatusDisplay: Partial<Record<string, JoinCompletionDisplay>> = {
  pending_payment: "processing",
  pending_review: "review",
  active: "active",
};

export async function loadJoinCompletionState(
  actor: Actor | null,
  membershipId: string | undefined,
  dependencies: Dependencies = defaultDependencies,
): Promise<JoinCompletionState | null> {
  if (!actor || actor.kind !== "member" || !membershipId) return null;
  try {
    const membership = await dependencies.memberships.getById(actor, membershipId);
    if (!membership || !membership.applicationId) return null;
    const display = completionStatusDisplay[membership.status];
    if (!display) return null;
    const application = await dependencies.applications.getById(actor, membership.applicationId);
    if (!application || application.id !== membership.applicationId) return null;
    if (application.planCode !== membership.planCode) return null;
    return {
      actor,
      display,
      membership: membership as JoinCompletionState["membership"],
      application,
    };
  } catch {
    return null;
  }
}
