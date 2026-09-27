import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {ApplicationQueueTable} from "@/components/admin/application-queue-table";
const labels = {caption: "Applications", applicant: "Applicant", application: "Application", company: "Company", plan: "Plan", step: "Step", membership: "Membership", billing: "Latest billing attempt", updated: "Updated", none: "Not started", empty: "No applications", states: {pending_payment: "Awaiting payment"}, steps: {checkout: "Checkout"}, plans: {startup: "Startup"}, billingStates: {expired: "Expired attempt"}};
describe("application queue entity links", () => {
  it("opens Member 360 by applicant profile and shows separate application, membership and billing identities", () => {
    render(<ApplicationQueueTable locale="zh-HK" labels={labels} items={[{applicationId: "11111111-1111-4111-8111-111111111111", profileId: "profile-a", name: "Synthetic Applicant", email: "a@example.test", companyId: null, companyName: null, planCode: "startup", applicationState: "pending_payment", step: "checkout", membershipId: "22222222-2222-4222-8222-222222222222", membershipState: "pending_payment", billingAttemptId: "33333333-3333-4333-8333-333333333333", billingState: "expired", updatedAt: "2026-09-27T01:00:00.000Z"}]}/>);
    expect(screen.getByRole("link", {name: "Synthetic Applicant"})).toHaveAttribute("href", "/zh/admin/members/profile-a");
    expect(screen.getByText("11111111-1111-4111-8111-111111111111")).toBeInTheDocument();
    expect(screen.getByText("22222222-2222-4222-8222-222222222222")).toBeInTheDocument();
    expect(screen.getByText("Expired attempt")).toBeInTheDocument();
    expect(screen.queryByRole("link", {name: "33333333-3333-4333-8333-333333333333"})).not.toBeInTheDocument();
  });
});
