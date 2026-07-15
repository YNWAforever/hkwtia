import {describe, expect, it, vi} from "vitest";

import type {CheckoutDependencies} from "@/lib/billing/checkout-service";
import type {BillingAttempt} from "@/lib/db/server-schema";
import type {MembershipRecord} from "@/lib/membership/lifecycle";
import {startNewCheckoutAttempt} from "@/lib/billing/checkout-service";
import {actorFor, FakeStripeBillingAdapter} from "@/tests/helpers/fakes";

const actor = actorFor("user-a");
const membershipId = "20000000-0000-4000-8000-000000000002";
const membership: MembershipRecord = {id: membershipId, ownerUserId: "user-a", companyId: null,
  applicationId: "10000000-0000-4000-8000-000000000001", planCode: "startup",
  status: "pending_payment", seatLimit: 5, stripeCustomerId: null};
const request = {expectedCurrentAttemptId: "attempt-1", recoveryRequestId: "recovery-double-click-1"};

function setup(record: MembershipRecord = membership) {
  const stripe = new FakeStripeBillingAdapter();
  const replacement: BillingAttempt = {id: "attempt-2", membershipId, attemptNumber: 2,
    idempotencyKey: `membership-checkout:${membershipId}:2`, priceReference: "price_startup_test",
    state: "active", stripeCheckoutSessionId: null, checkoutUrl: null,
    recoveryRequestId: request.recoveryRequestId, createdAt: new Date(), updatedAt: new Date(), endedAt: null};
  const attempts = {
    claimActive: vi.fn(async () => { throw new Error("MUST_NOT_RECLAIM"); }),
    getActive: vi.fn(async () => replacement), getById: vi.fn(async () => replacement),
    attachSession: vi.fn(async (_actor: unknown, attemptId: string,
      reference: {stripeCheckoutSessionId: string; checkoutUrl: string}) => {
      expect(attemptId).toBe(replacement.id);
      return {...replacement, ...reference};
    }),
    startNewAttempt: vi.fn(async () => ({attempt: replacement, membership: record})),
  };
  const dependencies = {stripe,
    memberships: {getById: vi.fn(async () => record), getBillingAccess: vi.fn(async () => record)},
    attempts, appUrl: "https://members.example.test", priceForPlan: () => "price_startup_test",
  } as unknown as CheckoutDependencies;
  return {stripe, attempts, dependencies, replacement};
}

describe("checkout recovery service", () => {
  it.each([
    {name: "active membership", record: {...membership, status: "active" as const}},
    {name: "free plan", record: {...membership, planCode: "community" as const}},
    {name: "missing application", record: {...membership, applicationId: null}},
  ])("rejects $name before mutating attempts", async ({record}) => {
    const value = setup(record);
    await expect(startNewCheckoutAttempt(actor, membershipId, "en", "expired", request, value.dependencies)).rejects.toThrow();
    expect(value.attempts.startNewAttempt).not.toHaveBeenCalled();
    expect(value.stripe.checkoutRequests).toHaveLength(0);
  });

  it("attaches Stripe to the exact replacement attempt without re-claiming", async () => {
    const value = setup();
    await expect(startNewCheckoutAttempt(actor, membershipId, "en", "abandoned", request, value.dependencies))
      .resolves.toEqual({url: value.stripe.checkoutUrl});
    expect(value.attempts.startNewAttempt).toHaveBeenCalledWith(actor, membershipId, "price_startup_test",
      "abandoned", {...request, expectedPlanCode: "startup"});
    expect(value.attempts.claimActive).not.toHaveBeenCalled();
    expect(value.stripe.checkoutRequests[0].idempotencyKey).toBe(value.replacement.idempotencyKey);
  });

  it("recovers a persisted exact replacement for a duplicate recovery token", async () => {
    const value = setup();
    value.attempts.startNewAttempt.mockResolvedValue({membership,
      attempt: {...value.replacement, stripeCheckoutSessionId: "cs_existing",
        checkoutUrl: "https://checkout.stripe.test/existing"}});
    await expect(startNewCheckoutAttempt(actor, membershipId, "en", "expired", request, value.dependencies))
      .resolves.toEqual({url: "https://checkout.stripe.test/existing"});
    expect(value.stripe.checkoutRequests).toHaveLength(0);
  });
});
