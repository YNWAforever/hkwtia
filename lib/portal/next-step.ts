import type {DashboardViewModel} from "@/lib/portal/queries";
import {getMembershipIssues} from "@/lib/portal/membership-selection";

export type PortalNextStep =
  | {kind: "billing"; reason: "past_due" | "pending_payment"}
  | {kind: "review"}
  | {kind: "onboarding"; step: "profile" | "company"}
  | null;

// Membership status outranks onboarding: a member whose payment lapsed or whose application is
// under review should not be nudged to fill in a profile first. Type-only import: queries.ts is server-only.
export function pickNextStep(vm: Pick<DashboardViewModel, "memberships" | "onboarding">): PortalNextStep {
  const issue = getMembershipIssues(vm.memberships)[0];
  switch (issue?.status) {
    case "past_due":
    case "pending_payment":
      return {kind: "billing", reason: issue.status};
    case "pending_review":
      return {kind: "review"};
  }
  if (vm.onboarding.nextAction === "complete-profile") return {kind: "onboarding", step: "profile"};
  if (vm.onboarding.nextAction === "complete-company") return {kind: "onboarding", step: "company"};
  return null;
}
