import "server-only";

import type {Actor, MembershipRecord} from "@/lib/membership/lifecycle";
import {membershipsRepository} from "@/lib/db/repos/memberships";

export type MembershipCheckoutDisplay = "processing" | "active" | "review" | "failed";
type MembershipReader = {getBillingAccess(actor: Actor, membershipId: string): Promise<MembershipRecord | null>};

export async function readMembershipCheckoutStatus(
  actor: Actor,
  membershipId: string,
  memberships: MembershipReader = membershipsRepository,
): Promise<MembershipCheckoutDisplay> {
  if (actor.kind !== "member") throw new Error("FORBIDDEN");
  const membership = await memberships.getBillingAccess(actor, membershipId);
  if (!membership || !membership.applicationId) throw new Error("FORBIDDEN");
  switch (membership.status) {
    case "pending_payment": return "processing";
    case "pending_review": return "review";
    case "active":
    case "cancel_at_period_end": return "active";
    default: return "failed";
  }
}
