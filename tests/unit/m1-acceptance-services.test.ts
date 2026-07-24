import {describe, expect, it} from "vitest";

import {systemActor} from "@/tests/helpers/fakes";
import {actorFor, FakeStripeBillingAdapter} from "@/tests/helpers/fakes";
import {createBillingPortalSession, createCheckoutSession, type CheckoutDependencies} from "@/lib/billing/checkout-service";
import {processStripeEvent, type WebhookLifecycleCommand, type WebhookProcessor} from "@/lib/billing/webhook-service";
import {applicationId, checkoutCompleted, membershipId} from "@/tests/fixtures/stripe-events";

function setup() {
  const stripe = new FakeStripeBillingAdapter();
  const membership = {
    id: membershipId,
    ownerUserId: "user-m1",
    companyId: null,
    applicationId,
    planCode: "startup" as const,
    status: "pending_payment" as "pending_payment" | "active",
    seatLimit: 5,
    stripeCustomerId: "cus_m1_customer",
    stripeSubscriptionId: null,
    billingPeriodStart: null,
    billingPeriodEnd: null,
  };
  const attempt = {
    id: "attempt-m1",
    membershipId,
    attemptNumber: 1,
    idempotencyKey: `membership-checkout:${membershipId}:1`,
    priceReference: "price_startup_test",
    state: "active" as const,
    stripeCheckoutSessionId: null as string | null,
    checkoutUrl: null as string | null,
    recoveryRequestId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    endedAt: null,
  };
  const deps: CheckoutDependencies = {
    stripe,
    memberships: {
      async getById() { return membership; },
      async getBillingAccess(actor, id) { return actor.kind === "member" && actor.userId === "user-m1" && id === membershipId ? membership : null; },
    },
    attempts: {
      async claimActive() { return {attempt, disposition: "created", membership}; },
      async getActive() { return attempt; },
      async getById() { return attempt; },
      async attachSession(_actor, _attemptId, input) { attempt.stripeCheckoutSessionId = input.stripeCheckoutSessionId; attempt.checkoutUrl = input.checkoutUrl; return attempt; },
      async startNewAttempt() { return {attempt, membership}; },
    },
    appUrl: "https://m1-acceptance.example.test",
    priceForPlan: () => "price_startup_test",
  };
  return {stripe, membership, deps};
}

describe("M1 acceptance service seams", () => {
  it("creates a real Checkout request with opaque metadata and stable idempotency", async () => {
    const {stripe, deps} = setup();
    await expect(createCheckoutSession(actorFor("user-m1"), membershipId, "en", deps)).resolves.toEqual({url: stripe.checkoutUrl});
    expect(stripe.checkoutRequests[0]).toMatchObject({
      clientReferenceId: membershipId,
      idempotencyKey: `membership-checkout:${membershipId}:1`,
      metadata: {membershipId, applicationId, planCode: "startup"},
    });
    expect(JSON.stringify(stripe.checkoutRequests[0])).not.toContain("user-m1");
  });

  it("runs the real webhook normalizer and processor exactly once on replay", async () => {
    const {membership} = setup();
    const seen = new Set<string>();
    const processor: WebhookProcessor = {
      async process(_actor, command: WebhookLifecycleCommand) {
        if (seen.has(command.eventId)) return "duplicate";
        seen.add(command.eventId);
        membership.status = command.nextStatus as typeof membership.status;
        return "processed";
      },
    };
    const event = checkoutCompleted("evt_m1_service");
    await expect(processStripeEvent(event, systemActor(), processor)).resolves.toBe("processed");
    await expect(processStripeEvent(event, systemActor(), processor)).resolves.toBe("duplicate");
    expect(membership.status).toBe("active");
    expect(seen).toHaveLength(1);
  });

  it("creates Billing Portal only for the membership owner", async () => {
    const {deps, membership, stripe} = setup();
    membership.status = "active";
    await expect(createBillingPortalSession(actorFor("user-m1"), membershipId, deps)).resolves.toEqual({url: stripe.portalUrl});
    await expect(createBillingPortalSession(actorFor("foreign-user"), membershipId, deps)).rejects.toThrow("FORBIDDEN");
    expect(stripe.portalRequests).toHaveLength(1);
  });
});