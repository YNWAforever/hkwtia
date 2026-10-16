import {describe, expect, it} from "vitest";
import {pickNextStep, type PortalNextStep} from "@/lib/portal/next-step";
import type {DashboardMembership, DashboardViewModel, PortalMembershipStatus} from "@/lib/portal/queries";

type NextAction = DashboardViewModel["onboarding"]["nextAction"];

const membership = (id: string, status: PortalMembershipStatus): DashboardMembership => ({
  id, status, ownerUserId: "member", companyId: null, applicationId: null, planCode: "startup",
  seatLimit: 5, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null,
});
const vm = (status: PortalMembershipStatus, nextAction: NextAction): Pick<DashboardViewModel, "memberships" | "onboarding"> => ({
  memberships: [membership("primary", status)],
  onboarding: {nextAction, completedSteps: 0, totalSteps: 2, profileComplete: false, companyComplete: false},
});

// Billing outranks review outranks onboarding: a lapsed member must not be nudged to finish a profile first.
const table: [PortalMembershipStatus, NextAction, PortalNextStep][] = [
  ["past_due", "complete-profile", {kind: "billing", reason: "past_due"}],
  ["past_due", "complete-company", {kind: "billing", reason: "past_due"}],
  ["past_due", "none", {kind: "billing", reason: "past_due"}],
  ["pending_payment", "complete-profile", {kind: "billing", reason: "pending_payment"}],
  ["pending_payment", "complete-company", {kind: "billing", reason: "pending_payment"}],
  ["pending_payment", "none", {kind: "billing", reason: "pending_payment"}],
  ["pending_review", "complete-profile", {kind: "review"}],
  ["pending_review", "complete-company", {kind: "review"}],
  ["pending_review", "none", {kind: "review"}],
  ["active", "complete-profile", {kind: "onboarding", step: "profile"}],
  ["active", "complete-company", {kind: "onboarding", step: "company"}],
  ["active", "none", null],
  ["cancel_at_period_end", "complete-profile", {kind: "onboarding", step: "profile"}],
  ["cancel_at_period_end", "complete-company", {kind: "onboarding", step: "company"}],
  ["cancel_at_period_end", "none", null],
];

describe("pickNextStep", () => {
  it.each(table)("%s + %s", (status, action, expected) => {
    expect(pickNextStep(vm(status, action))).toEqual(expected);
  });

  it.each([false, true])("keeps secondary arrears visible beside an active membership (reversed=%s)", (reversed) => {
    const memberships = [membership("active", "active"), membership("due", "past_due")];
    const input = {...vm("active", "complete-profile"), memberships: reversed ? memberships.toReversed() : memberships};
    expect(pickNextStep(input)).toEqual({kind: "billing", reason: "past_due"});
  });

  it("prioritizes arrears over a separate pending application", () => {
    const input = {...vm("active", "none"), memberships: [
      membership("review", "pending_review"), membership("payment", "pending_payment"),
      membership("active", "active"), membership("due", "past_due"),
    ]};
    expect(pickNextStep(input)).toEqual({kind: "billing", reason: "past_due"});
  });
});
