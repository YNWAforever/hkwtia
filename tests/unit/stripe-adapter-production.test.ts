import {describe, expect, it, vi} from "vitest";
import {createStripeBillingAdapter} from "@/lib/billing/stripe";

function client(portalCreate = vi.fn(), invoiceList = vi.fn()) {
  return {
    checkout: {sessions: {create: vi.fn(), retrieve: vi.fn(), list: vi.fn()}},
    subscriptions: {retrieve: vi.fn()},
    billingPortal: {sessions: {create: portalCreate}},
    invoices: {list: invoiceList},
    refunds: {create: vi.fn(), list: vi.fn()},
    paymentIntents: {retrieve: vi.fn()},
  };
}

describe("production Stripe billing adapter mappings", () => {
  it("reads the live subscription status used to reconcile same-second webhooks", async () => {
    const source = client();
    source.subscriptions.retrieve.mockResolvedValue({id: "sub_1", customer: "cus_1", status: "past_due",
      cancel_at_period_end: false,
      items: {data: [{current_period_start: 1_784_156_400, current_period_end: 1_786_834_800}]}});
    await expect(createStripeBillingAdapter(source).currentSubscription("sub_1")).resolves.toEqual({
      stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", nextStatus: "past_due", cancelAtPeriodEnd: false,
      billingPeriodStart: new Date(1_784_156_400 * 1000), billingPeriodEnd: new Date(1_786_834_800 * 1000),
    });
    expect(source.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
  });
  it("maps Billing Portal customer and return URL", async () => {
    const create = vi.fn().mockResolvedValue({url: "https://billing.stripe.test/bps_1"});
    const adapter = createStripeBillingAdapter(client(create));
    await expect(adapter.createBillingPortalSession({
      customerId: "cus_owned",
      returnUrl: "https://members.example.test/portal/billing",
    })).resolves.toEqual({url: "https://billing.stripe.test/bps_1"});
    expect(create).toHaveBeenCalledWith({customer: "cus_owned", return_url: "https://members.example.test/portal/billing"});
  });

  it("scopes invoice listing to the customer with a bounded limit", async () => {
    const list = vi.fn().mockResolvedValue({data: []});
    const adapter = createStripeBillingAdapter(client(vi.fn(), list));
    await expect(adapter.listInvoices("cus_owned")).resolves.toEqual([]);
    expect(list).toHaveBeenCalledWith({customer: "cus_owned", limit: 100});
  });
});
