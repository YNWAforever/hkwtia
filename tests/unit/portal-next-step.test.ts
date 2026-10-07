import {describe, expect, it} from "vitest";
import {pickNextStep, type PortalNextStep} from "@/lib/portal/next-step";
import type {DashboardViewModel, PortalMembershipStatus} from "@/lib/portal/queries";

type NextAction = DashboardViewModel["onboarding"]["nextAction"];

const vm = (primaryStatus: PortalMembershipStatus, nextAction: NextAction) =>
  ({primaryStatus, onboarding: {nextAction}}) as Pick<DashboardViewModel, "primaryStatus" | "onboarding">;

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
});
