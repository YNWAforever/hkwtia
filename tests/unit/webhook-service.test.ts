import {describe, expect, it, vi} from "vitest";

import {processStripeEvent, type WebhookLifecycleCommand, type WebhookProcessor} from "@/lib/billing/webhook-service";
import {systemActor} from "@/lib/auth/authorize";
import {
  applicationId,
  checkoutCompleted,
  checkoutSessionId,
  customerId,
  invoicePaid,
  invoicePaidWithCurrentParent,
  invoicePaymentFailed,
  membershipId,
  subscriptionDeleted,
  subscriptionId,
  subscriptionUpdatedLegacyPeriod,
  subscriptionUpdated,
} from "@/tests/fixtures/stripe-events";

function captureProcessor() {
  const commands: WebhookLifecycleCommand[] = [];
  const seen = new Set<string>();
  const processor: WebhookProcessor = {
    async process(_actor, command) {
      if (seen.has(command.eventId)) return "duplicate";
      seen.add(command.eventId);
      commands.push(command);
      return "processed";
    },
  };
  return {commands, processor};
}

describe("Stripe webhook lifecycle mapping", () => {
  it("activates checkout only with the exact membership, application, plan, customer, subscription, and session correlation", async () => {
    const {commands, processor} = captureProcessor();
    await expect(processStripeEvent(checkoutCompleted(), systemActor("stripe-webhook"), processor)).resolves.toBe("processed");
    expect(commands[0]).toMatchObject({
      eventType: "checkout.session.completed", membershipId, applicationId, planCode: "startup",
      stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId,
      stripeCheckoutSessionId: checkoutSessionId, nextStatus: "active",
    });
  });

  it("waits for delayed Checkout payment and activates on async success", async () => {
    const {commands, processor} = captureProcessor();
    const pending = checkoutCompleted("evt_pending", {payment_status: "unpaid", customer: null, subscription: null});
    await expect(processStripeEvent(pending, systemActor("stripe-webhook"), processor)).resolves.toBe("processed");
    expect(commands).toEqual([]);

    const paid = {...checkoutCompleted("evt_delayed_paid"), type: "checkout.session.async_payment_succeeded"} as ReturnType<typeof checkoutCompleted>;
    await expect(processStripeEvent(paid, systemActor("stripe-webhook"), processor)).resolves.toBe("processed");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({eventType: "checkout.session.async_payment_succeeded", stripeCheckoutSessionId: checkoutSessionId, nextStatus: "active"});
  });
  it("routes a failed ticket refund to reconciliation instead of acknowledging it unseen", async () => {
    const processor = {process: vi.fn(async () => "processed" as const)};
    const failed = {
      ...checkoutCompleted("evt_refund_failed"), type: "refund.failed",
      data: {object: {id: "re_failed", status: "failed", payment_intent: "pi_ticket",
        amount: 25_000, currency: "hkd", metadata: {eventOrderId: "33333333-3333-4333-8333-333333333333"}}},
    } as unknown as ReturnType<typeof checkoutCompleted>;
    await expect(processStripeEvent(failed, systemActor("stripe-webhook"), captureProcessor().processor, null, processor))
      .resolves.toBe("processed");
    expect(processor.process).toHaveBeenCalledWith(expect.anything(), {
      eventId: "evt_refund_failed", refundId: "re_failed", paymentIntentId: "pi_ticket",
      orderId: "33333333-3333-4333-8333-333333333333", amountHkdCents: 25_000,
    });
  });
  it("routes old refund failures without refund metadata for Checkout lookup", async () => {
    const processor = {process: vi.fn(async () => "processed" as const)};
    const failed = {...checkoutCompleted("evt_old_refund"), type: "refund.failed",
      data: {object: {id: "re_old", status: "failed", payment_intent: "pi_ticket",
        amount: 25_000, currency: "hkd", metadata: {}}}} as unknown as ReturnType<typeof checkoutCompleted>;
    await expect(processStripeEvent(failed, systemActor("stripe-webhook"), captureProcessor().processor, null, processor))
      .resolves.toBe("processed");
    expect(processor.process).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({orderId: null}));
  });
  it("restores a past-due membership after invoice.paid", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(invoicePaid(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType: "invoice.paid", nextStatus: "active", isRenewal: false});
  });

  it.each([
    [invoicePaid("evt_cycle_paid", {billing_reason: "subscription_cycle"}), "invoice.paid"],
    [invoicePaymentFailed("evt_cycle_failed", {billing_reason: "subscription_cycle", period_start: 1_784_156_400, period_end: 1_786_834_800}), "invoice.payment_failed"],
  ] as const)("marks subscription-cycle renewal facts", async (stripeEvent, eventType) => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(stripeEvent, systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType, isRenewal: true});
  });

  it("reads subscription correlation from the current Stripe invoice parent shape", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(invoicePaidWithCurrentParent(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({stripeSubscriptionId: subscriptionId, applicationId});
  });

  it("moves a membership to past_due after invoice.payment_failed", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(invoicePaymentFailed(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({
      eventType: "invoice.payment_failed",
      nextStatus: "past_due",
      billingPeriodEnd: null,
    });
  });

  it("maps a scheduled cancellation subscription update", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(subscriptionUpdated(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType: "customer.subscription.updated", nextStatus: "cancel_at_period_end", cancelAtPeriodEnd: true});
  });

  it("reads the subscription billing period from the subscription items", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(subscriptionUpdated(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({
      billingPeriodStart: new Date(1_784_156_400 * 1000),
      billingPeriodEnd: new Date(1_786_834_800 * 1000),
    });
  });

  it("still reads a top-level period from an endpoint on an older API version", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(subscriptionUpdatedLegacyPeriod(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({
      billingPeriodStart: new Date(1_784_156_400 * 1000),
      billingPeriodEnd: new Date(1_786_834_800 * 1000),
    });
  });

  it("cancels a membership after customer.subscription.deleted", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(subscriptionDeleted(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({
      eventType: "customer.subscription.deleted",
      nextStatus: "cancelled",
      billingPeriodEnd: null,
    });
  });

  it("returns duplicate and emits no second transition command for an exact replay", async () => {
    const {commands, processor} = captureProcessor();
    const stripeEvent = checkoutCompleted("evt_replay");
    expect(await processStripeEvent(stripeEvent, systemActor("stripe-webhook"), processor)).toBe("processed");
    expect(await processStripeEvent(stripeEvent, systemActor("stripe-webhook"), processor)).toBe("duplicate");
    expect(commands).toHaveLength(1);
  });

  it.each([
    checkoutCompleted("evt_bad_metadata", {metadata: {membershipId}}),
    checkoutCompleted("evt_bad_reference", {client_reference_id: "11111111-1111-4111-8111-111111111112"}),
    invoicePaid("evt_bad_customer", {customer: null}),
    checkoutCompleted("evt_free_plan", {metadata: {membershipId, applicationId, planCode: "community"}}),
    invoicePaid("evt_cycle_missing_period", {billing_reason: "subscription_cycle", period_start: null}),
  ])("rejects malformed or inconsistent ownership metadata before repository mutation", async (stripeEvent) => {
    const {commands, processor} = captureProcessor();
    await expect(processStripeEvent(stripeEvent, systemActor("stripe-webhook"), processor)).rejects.toMatchObject({code: "INVALID_WEBHOOK_EVENT"});
    expect(commands).toEqual([]);
  });

  it("rejects every actor except stripe-webhook systemActor before mutation", async () => {
    const {commands, processor} = captureProcessor();
    await expect(processStripeEvent(checkoutCompleted(), {kind: "member", userId: "user-a", profileId: "user-a"}, processor)).rejects.toThrow("FORBIDDEN");
    expect(commands).toEqual([]);
  });
});
