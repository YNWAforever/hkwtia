import {describe, expect, it} from "vitest";

import {processStripeEvent, type WebhookLifecycleCommand, type WebhookProcessor} from "@/lib/billing/webhook-service";
import {systemActor} from "@/lib/auth/actor";
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

  it("restores a past-due membership after invoice.paid", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(invoicePaid(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType: "invoice.paid", nextStatus: "active"});
  });

  it("reads subscription correlation from the current Stripe invoice parent shape", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(invoicePaidWithCurrentParent(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({stripeSubscriptionId: subscriptionId, applicationId});
  });

  it("moves a membership to past_due after invoice.payment_failed", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(invoicePaymentFailed(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType: "invoice.payment_failed", nextStatus: "past_due"});
  });

  it("maps a scheduled cancellation subscription update", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(subscriptionUpdated(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType: "customer.subscription.updated", nextStatus: "cancel_at_period_end", cancelAtPeriodEnd: true});
  });

  it("cancels a membership after customer.subscription.deleted", async () => {
    const {commands, processor} = captureProcessor();
    await processStripeEvent(subscriptionDeleted(), systemActor("stripe-webhook"), processor);
    expect(commands[0]).toMatchObject({eventType: "customer.subscription.deleted", nextStatus: "cancelled"});
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
    checkoutCompleted("evt_unpaid", {payment_status: "unpaid"}),
    checkoutCompleted("evt_free_plan", {metadata: {membershipId, applicationId, planCode: "community"}}),
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
