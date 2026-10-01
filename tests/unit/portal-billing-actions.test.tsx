import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {BillingActions} from "@/components/billing/billing-actions";
import type {BillingMembershipSummary} from "@/lib/portal/billing-summary";

function membership(id: string, status: BillingMembershipSummary["status"]): BillingMembershipSummary {
  return {id, companyId: null, planCode: "startup", status, canManageBilling: true,
    recovery: status === "pending_payment" ? "new_checkout" : status === "pending_review" ? "support" : "resume",
    subscriptionRef: null, canViewHistory: status !== "pending_review", providerAvailable: true};
}

describe("BillingActions", () => {
  it("offers recovery for pending and past-due memberships and management for active billing", () => {
    const action = vi.fn(async () => {});
    render(<BillingActions memberships={[membership("pending", "pending_payment"), membership("past-due", "past_due"), membership("active", "active")]} supportHref="/contact" labels={{history: "Billing history", support: "Contact support", supportMessage: "No entitlement restored", providerUnavailable: "Provider unavailable", manage: "Manage billing", recover: "Continue payment", empty: "No billing actions", plan: (code) => code, status: (value) => value}} actions={{pending: action, "past-due": action, active: action}} />);
    expect(screen.getAllByRole("button", {name: "Continue payment"})).toHaveLength(1);
    expect(screen.getAllByRole("button", {name: "Manage billing"})).toHaveLength(2);

  });

  it("renders the honest empty state when no membership can take a billing action", () => {
    render(<BillingActions memberships={[membership("review", "pending_review")]} supportHref="/contact" labels={{history: "Billing history", support: "Contact support", supportMessage: "No entitlement restored", providerUnavailable: "Provider unavailable", manage: "Manage billing", recover: "Continue payment", empty: "No billing actions", plan: (code) => code, status: (value) => value}} actions={{}} />);
    expect(screen.getByText("pending_review")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Contact support"})).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
