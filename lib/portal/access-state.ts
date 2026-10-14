import type {MembershipRecord} from "@/lib/membership/lifecycle";
import {isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";

export type PortalAccessState = Readonly<{status: "ready" | "needs_payment" | "under_review" | "inactive" | "no_company"}>;
export type PortalRecoveryState = Readonly<{status: Exclude<PortalAccessState["status"], "ready">}>;

/** Classify only already actor-scoped memberships; this does not grant access or replace repository checks. */
export function classifyPortalAccess(
  memberships: readonly Pick<MembershipRecord, "status" | "companyId">[],
  options: Readonly<{requiresCompany?: boolean}> = {},
): PortalAccessState {
  const eligible = memberships.filter((row) => isBenefitEligibleMembershipStatus(row.status));
  if (eligible.length > 0) {
    return {status: options.requiresCompany && !eligible.some((row) => row.companyId) ? "no_company" : "ready"};
  }
  if (memberships.some((row) => row.status === "pending_payment")) return {status: "needs_payment"};
  if (memberships.some((row) => row.status === "pending_review")) return {status: "under_review"};
  return {status: "inactive"};
}

/** Preserve the established guard error while giving server pages a safe recovery state. */
export class PortalAccessDenied extends Error {
  constructor(readonly access: PortalRecoveryState) {
    super("MEMBERSHIP_INACTIVE");
    this.name = "PortalAccessDenied";
  }
}

/** Expected entitlement denial is recoverable; infrastructure and programming errors still propagate. */
export async function readPortalPage<T>(read: () => Promise<T>): Promise<
  {ok: true; value: T} | {ok: false; access: PortalRecoveryState}
> {
  try {
    return {ok: true, value: await read()};
  } catch (error) {
    if (error instanceof PortalAccessDenied) return {ok: false, access: error.access};
    throw error;
  }
}
