import {describe, expect, it, vi} from "vitest";
import {createStripeBillingAdapter} from "@/lib/billing/stripe";

function client(portalCreate = vi.fn(), invoiceList = vi.fn()) {
  return {
    checkout: {sessions: {create: vi.fn()}},
    billingPortal: {sessions: {create: portalCreate}},
    invoices: {list: invoiceList},
  };
}

describe("production Stripe billing adapter mappings", () => {
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
