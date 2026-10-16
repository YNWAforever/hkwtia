import "server-only";

import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import type {Membership} from "@/lib/db/server-schema";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {stripeBillingAdapter, type StripeBillingAdapter} from "@/lib/billing/stripe";

export type BillingRecovery = "none" | "resume" | "new_checkout" | "support";
export type BillingMembershipSummary = Readonly<Pick<Membership, "id" | "planCode" | "status" | "companyId"> & {
  canManageBilling: boolean;
  recovery: BillingRecovery;
  subscriptionRef: string | null;
  canViewHistory: boolean;
  providerAvailable: boolean;
}>;
export type BillingSummary = Readonly<{
  membershipId: string | null;
  status: string;
  canManageBilling: boolean;
  recovery: BillingRecovery;
  subscriptionRef: string | null;
  memberships: readonly BillingMembershipSummary[];
}>;
export type BillingSummaryDependencies = Readonly<{
  memberships: Pick<typeof membershipsRepository, "listBilling">;
  stripe: () => Pick<StripeBillingAdapter, "currentSubscription">;
}>;
const defaultDependencies: BillingSummaryDependencies = {memberships: membershipsRepository, stripe: stripeBillingAdapter};

/** An authorized billing read never loads active-entitlement private content. */
export async function getBillingSummary(actor: Actor, dependencies: BillingSummaryDependencies = defaultDependencies): Promise<BillingSummary> {
  requireMember(actor);
  const records = await dependencies.memberships.listBilling(actor);
  const memberships = await Promise.all(records.map(async (membership): Promise<BillingMembershipSummary> => {
    let recovery: BillingRecovery = membership.status === "pending_payment" && !membership.stripeSubscriptionId && membership.applicationId && ["startup", "corporate"].includes(membership.planCode) ? "new_checkout" : "support";
    let providerAvailable = true;
    let canViewHistory = Boolean(membership.stripeCustomerId);
    if (membership.stripeSubscriptionId) {
      try {
        const current = await dependencies.stripe().currentSubscription(membership.stripeSubscriptionId);
        if (current.stripeCustomerId !== membership.stripeCustomerId || current.stripeSubscriptionId !== membership.stripeSubscriptionId) throw new Error("BILLING_SUBSCRIPTION_CORRELATION_FAILED");
        // A pending row with a subscription needs reconciliation, never a
        // second checkout. Provider truth guides management, not activation.
        recovery = membership.status !== "pending_payment" && ["active", "past_due", "cancel_at_period_end"].includes(current.nextStatus) ? "resume" : "support";
      } catch {
        providerAvailable = false;
        canViewHistory = false;
        recovery = "support";
      }
    } else if (membership.status === "active" && !membership.stripeCustomerId) {
      recovery = "none";
    }
    return {id: membership.id, planCode: membership.planCode, status: membership.status, companyId: membership.companyId, canManageBilling: true, recovery, subscriptionRef: membership.stripeSubscriptionId, canViewHistory, providerAvailable};
  }));
  const primary = memberships[0];
  return {membershipId: primary?.id ?? null, status: primary?.status ?? "none", canManageBilling: Boolean(primary), recovery: primary?.recovery ?? "support", subscriptionRef: primary?.subscriptionRef ?? null, memberships};
}
