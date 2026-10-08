import {render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {BillingActions} from "@/components/billing/billing-actions";
import type {BillingMembershipSummary} from "@/lib/portal/billing-summary";

function membership(id: string, status: BillingMembershipSummary["status"], over: Partial<BillingMembershipSummary> = {}): BillingMembershipSummary {
  return {id, companyId: null, planCode: "startup", status, canManageBilling: true,
    recovery: status === "pending_payment" ? "new_checkout" : status === "pending_review" ? "support" : "resume",
    subscriptionRef: null, canViewHistory: status !== "pending_review", providerAvailable: true, ...over};
}

const labels = {
  history: "Billing history", support: "Contact support", supportMessage: "No entitlement restored", providerUnavailable: "Provider unavailable",
  manage: "Manage billing", manageHelp: "Opens Stripe's secure page", recover: "Continue payment", pastDue: "Last payment failed",
  empty: "No billing actions", emptyCopy: "Billing appears here", emptyAction: "View membership options",
  plan: (code: string) => code, status: (value: string) => value,
  renewsOn: (date: Date) => `Renews on ${date.toISOString().slice(0, 10)}`, endsOn: (date: Date) => `Ends on ${date.toISOString().slice(0, 10)}`, seats: (count: number) => `${count} seats`,
};
const base = {supportHref: "/contact", membershipHref: "/membership", labels};

describe("BillingActions", () => {
  it("offers recovery for pending and past-due memberships and management for active billing", () => {
    const action = vi.fn(async () => {});
    render(<BillingActions {...base} memberships={[membership("pending", "pending_payment"), membership("past-due", "past_due"), membership("active", "active")]} actions={{pending: action, "past-due": action, active: action}} details={{}} />);
    expect(screen.getAllByRole("button", {name: "Continue payment"})).toHaveLength(1);
    expect(screen.getAllByRole("button", {name: "Manage billing"})).toHaveLength(2);
    expect(document.querySelectorAll("article")).toHaveLength(3);
    for (const card of document.querySelectorAll("article")) expect(card.querySelectorAll(".button")).toHaveLength(1);
  });

  it("shows plan heading, status, renewal, seats and what Manage billing opens", () => {
    const action = vi.fn(async () => {});
    render(<BillingActions {...base} memberships={[membership("active", "active")]} actions={{active: action}} details={{active: {period: {kind: "renews", date: new Date("2026-11-12T00:00:00Z")}, seatLimit: 3}}} />);
    expect(screen.getByRole("heading", {name: "startup"})).toBeInTheDocument();
    expect(document.querySelector(".status-label")).toHaveTextContent("active");
    expect(screen.getByText("Renews on 2026-11-12")).toBeInTheDocument();
    expect(screen.getByText("3 seats")).toBeInTheDocument();
    expect(screen.getByText("Opens Stripe's secure page")).toBeInTheDocument();
  });

  it("says when the membership ends and omits the line without a period", () => {
    const action = vi.fn(async () => {});
    const {rerender} = render(<BillingActions {...base} memberships={[membership("a", "active")]} actions={{a: action}} details={{a: {period: {kind: "ends", date: new Date("2026-11-12T00:00:00Z")}, seatLimit: null}}} />);
    expect(screen.getByText("Ends on 2026-11-12")).toBeInTheDocument();
    expect(screen.queryByText(/seats/)).not.toBeInTheDocument();
    rerender(<BillingActions {...base} memberships={[membership("a", "active")]} actions={{a: action}} details={{}} />);
    expect(screen.queryByText(/Ends on|Renews on/)).not.toBeInTheDocument();
  });

  it("explains a past-due membership in an alert and flags an unverified provider", () => {
    const action = vi.fn(async () => {});
    render(<BillingActions {...base} memberships={[membership("p", "past_due", {providerAvailable: false})]} actions={{p: action}} details={{}} />);
    expect(document.querySelector(".portal-form-alert")).toHaveTextContent("Last payment failed");
    expect(screen.getByRole("status")).toHaveTextContent("Provider unavailable");
  });

  it("shows the manage help only beside Manage billing", () => {
    const action = vi.fn(async () => {});
    render(<BillingActions {...base} memberships={[membership("pending", "pending_payment")]} actions={{pending: action}} details={{}} />);
    expect(screen.queryByText("Opens Stripe's secure page")).not.toBeInTheDocument();
  });

  it("offers support without a button when no membership can take a billing action", () => {
    render(<BillingActions {...base} memberships={[membership("review", "pending_review")]} actions={{}} details={{}} />);
    expect(screen.getByText("pending_review")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Contact support"})).toHaveAttribute("href", "/contact");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the honest empty state linking to membership when there are no memberships", () => {
    render(<BillingActions {...base} memberships={[]} actions={{}} details={{}} />);
    const region = screen.getByRole("status");
    expect(within(region).getByText("No billing actions")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "View membership options"})).toHaveAttribute("href", "/membership");
  });
});
