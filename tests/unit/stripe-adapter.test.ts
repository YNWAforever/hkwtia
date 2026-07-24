import {describe, expect, it, vi} from "vitest";

import {createStripeBillingAdapter} from "@/lib/billing/stripe";

describe("Stripe billing adapter", () => {
  it("maps checkout parameters and passes the stable idempotency key as request options", async () => {
    const create = vi.fn().mockResolvedValue({url: "https://checkout.stripe.test/cs_1"});
    const adapter = createStripeBillingAdapter({
      checkout: {sessions: {create}},
      billingPortal: {sessions: {create: vi.fn()}},
      invoices: {list: vi.fn()},
    });
    await adapter.createCheckoutSession({
      priceReference: "price_startup_test",
      clientReferenceId: "membership-opaque",
      metadata: {membershipId: "membership-opaque", applicationId: "application-opaque", planCode: "startup"},
      successUrl: "https://members.example.test/join/complete",
      cancelUrl: "https://members.example.test/join/checkout",
      idempotencyKey: "membership-checkout:membership-opaque:initial",
    });
    expect(create).toHaveBeenCalledWith({
      mode: "subscription",
      line_items: [{price: "price_startup_test", quantity: 1}],
      client_reference_id: "membership-opaque",
      metadata: {membershipId: "membership-opaque", applicationId: "application-opaque", planCode: "startup"},
      subscription_data: {metadata: {membershipId: "membership-opaque", applicationId: "application-opaque", planCode: "startup"}},
      success_url: "https://members.example.test/join/complete",
      cancel_url: "https://members.example.test/join/checkout",
    }, {idempotencyKey: "membership-checkout:membership-opaque:initial"});
  });

  it("rejects a Stripe checkout response without a URL", async () => {
    const adapter = createStripeBillingAdapter({
      checkout: {sessions: {create: vi.fn().mockResolvedValue({url: null})}},
      billingPortal: {sessions: {create: vi.fn()}},
      invoices: {list: vi.fn()},
    });
    await expect(adapter.createCheckoutSession({
      priceReference: "price_test",
      clientReferenceId: "membership-opaque",
      metadata: {membershipId: "membership-opaque", applicationId: "application-opaque", planCode: "startup"},
      successUrl: "https://members.example.test/success",
      cancelUrl: "https://members.example.test/cancel",
      idempotencyKey: "stable-key",
    })).rejects.toThrow("STRIPE_CHECKOUT_URL_MISSING");
  });
});
