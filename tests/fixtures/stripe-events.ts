import type Stripe from "stripe";

export const membershipId = "11111111-1111-4111-8111-111111111111";
export const applicationId = "22222222-2222-4222-8222-222222222222";
export const customerId = "cus_m1_customer";
export const subscriptionId = "sub_m1_subscription";
export const checkoutSessionId = "cs_test_m1_checkout";

const metadata = {membershipId, applicationId, planCode: "startup"};

function event(type: string, id: string, object: Record<string, unknown>, created = 1_784_156_400): Stripe.Event {
  return {id, type, created, data: {object}} as unknown as Stripe.Event;
}

export function checkoutCompleted(id = "evt_checkout", overrides: Record<string, unknown> = {}): Stripe.Event {
  return event("checkout.session.completed", id, {
    id: checkoutSessionId,
    client_reference_id: membershipId,
    customer: customerId,
    subscription: subscriptionId,
    payment_status: "paid",
    metadata,
    ...overrides,
  });
}

export function invoicePaid(id = "evt_invoice_paid", overrides: Record<string, unknown> = {}): Stripe.Event {
  return event("invoice.paid", id, {
    id: "in_paid",
    customer: customerId,
    subscription: subscriptionId,
    subscription_details: {metadata},
    period_start: 1_784_156_400,
    period_end: 1_786_834_800,
    ...overrides,
  });
}

export function invoicePaidWithCurrentParent(id = "evt_invoice_parent"): Stripe.Event {
  return event("invoice.paid", id, {
    id: "in_parent",
    customer: customerId,
    parent: {subscription_details: {subscription: subscriptionId, metadata}},
    period_start: 1_784_156_400,
    period_end: 1_786_834_800,
  });
}

export function invoicePaymentFailed(id = "evt_invoice_failed", overrides: Record<string, unknown> = {}): Stripe.Event {
  return event("invoice.payment_failed", id, {
    id: "in_failed",
    customer: customerId,
    subscription: subscriptionId,
    subscription_details: {metadata},
    ...overrides,
  });
}

// API version 2026-06-24.dahlia moved the billing period off the subscription
// and onto its items.
export function subscriptionUpdated(id = "evt_subscription_updated", overrides: Record<string, unknown> = {}): Stripe.Event {
  return event("customer.subscription.updated", id, {
    id: subscriptionId,
    customer: customerId,
    status: "active",
    cancel_at_period_end: true,
    items: {
      object: "list",
      data: [{
        id: "si_m1",
        object: "subscription_item",
        current_period_start: 1_784_156_400,
        current_period_end: 1_786_834_800,
      }],
    },
    metadata,
    ...overrides,
  });
}

/** An endpoint still pinned to an API version before the period fields moved. */
export function subscriptionUpdatedLegacyPeriod(id = "evt_subscription_legacy"): Stripe.Event {
  return event("customer.subscription.updated", id, {
    id: subscriptionId,
    customer: customerId,
    status: "active",
    cancel_at_period_end: true,
    current_period_start: 1_784_156_400,
    current_period_end: 1_786_834_800,
    metadata,
  });
}

export function subscriptionDeleted(id = "evt_subscription_deleted", overrides: Record<string, unknown> = {}): Stripe.Event {
  return event("customer.subscription.deleted", id, {
    id: subscriptionId,
    customer: customerId,
    status: "canceled",
    cancel_at_period_end: false,
    metadata,
    ...overrides,
  });
}
