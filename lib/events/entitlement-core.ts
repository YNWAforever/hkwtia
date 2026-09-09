import type {MembershipPlanCode} from "@/lib/membership/constants";
import {entitlementsFor} from "@/lib/membership/entitlements";

export type EventEntitlementCode = "EVENT_PUBLISHING_NOT_INCLUDED" | "EVENT_QUOTA_EXCEEDED";

export class EventEntitlementError extends Error {
  constructor(readonly code: EventEntitlementCode, readonly plan: MembershipPlanCode, readonly limit: number) {
    super(code);
    this.name = "EventEntitlementError";
  }
}

/**
 * Programme D-5: Community cannot submit; Startup gets 2 reviewed events per
 * calendar quarter; Corporate and Patron are unlimited (Infinity). Pure so the
 * portal action and the repository can both call it with a count they already
 * hold (`countCompanySubmissionsThisQuarter`).
 */
export function assertCanSubmitEvent(plan: MembershipPlanCode, usedThisQuarter: number): void {
  const limit = entitlementsFor(plan).publishEventsPerQuarter;
  if (limit <= 0) throw new EventEntitlementError("EVENT_PUBLISHING_NOT_INCLUDED", plan, limit);
  if (usedThisQuarter >= limit) throw new EventEntitlementError("EVENT_QUOTA_EXCEEDED", plan, limit);
}
