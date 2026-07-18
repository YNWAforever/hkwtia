import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {BillingActions} from "@/components/billing/billing-actions";
import type {DashboardMembership} from "@/lib/portal/queries";

function membership(id: string, status: DashboardMembership["status"]): DashboardMembership {
  return {id, ownerUserId: "user-a", companyId: null, applicationId: null, planCode: "startup", status, seatLimit: 5, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null};
}

describe("BillingActions", () => {
  it("offers recovery for pending and past-due memberships and management for active billing", () => {
    const action = vi.fn(async () => {});
    render(<BillingActions memberships={[membership("pending", "pending_payment"), membership("past-due", "past_due"), membership("active", "active")]} labels={{manage: "Manage billing", recover: "Continue payment", empty: "No billing actions", plan: (code) => code, status: (value) => value}} actions={{pending: action, "past-due": action, active: action}} />);
    expect(screen.getAllByRole("button", {name: "Continue payment"})).toHaveLength(2);
    expect(screen.getByRole("button", {name: "Manage billing"})).toBeInTheDocument();
  });

  it("renders the honest empty state when no membership can take a billing action", () => {
    render(<BillingActions memberships={[membership("review", "pending_review")]} labels={{manage: "Manage billing", recover: "Continue payment", empty: "No billing actions", plan: (code) => code, status: (value) => value}} actions={{review: vi.fn(async () => {})}} />);
    expect(screen.getByText("No billing actions")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});