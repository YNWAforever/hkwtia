import type {DashboardViewModel} from "@/lib/portal/queries";

export type PortalNextStep =
  | {kind: "billing"; reason: "past_due" | "pending_payment"}
  | {kind: "review"}
  | {kind: "onboarding"; step: "profile" | "company"}
  | null;

// Membership status outranks onboarding: a member whose payment lapsed or whose application is
// under review should not be nudged to fill in a profile first. Type-only import: queries.ts is server-only.
export function pickNextStep(vm: Pick<DashboardViewModel, "primaryStatus" | "onboarding">): PortalNextStep {
  switch (vm.primaryStatus) {
    case "past_due":
    case "pending_payment":
      return {kind: "billing", reason: vm.primaryStatus};
    case "pending_review":
      return {kind: "review"};
    case "active":
    case "cancel_at_period_end":
      break;
  }
  if (vm.onboarding.nextAction === "complete-profile") return {kind: "onboarding", step: "profile"};
  if (vm.onboarding.nextAction === "complete-company") return {kind: "onboarding", step: "company"};
  return null;
}
