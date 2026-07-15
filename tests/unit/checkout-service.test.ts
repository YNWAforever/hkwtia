import {describe, expect, it, vi} from "vitest";

import type {Actor} from "@/lib/membership/lifecycle";
import type {BillingAttempt} from "@/lib/db/server-schema";
import type {CheckoutSessionReference} from "@/lib/db/repos/billing-attempts";
import {createBillingPortalSession, createCheckoutSession} from "@/lib/billing/checkout-service";
import {listReceipts} from "@/lib/billing/receipt-service";
import {actorFor, FakeStripeBillingAdapter} from "@/tests/helpers/fakes";

const applicationId = "10000000-0000-4000-8000-000000000001";
const membershipId = "20000000-0000-4000-8000-000000000002";

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: membershipId,
    ownerUserId: "user@example.test",
    companyId: null,
    applicationId,
    planCode: "startup" as const,
    status: "pending_payment" as const,
    seatLimit: 5,
    stripeCustomerId: null,
    ...overrides,
  };
}

function dependencies(record = membership()) {
  const stripe = new FakeStripeBillingAdapter();
  const update = vi.fn();
  let attempt: BillingAttempt = {id: "attempt-1", membershipId, attemptNumber: 1,
    idempotencyKey: `membership-checkout:${membershipId}:1`, priceReference: "price_startup_test",
    state: "active", stripeCheckoutSessionId: null, checkoutUrl: null,
    createdAt: new Date(), updatedAt: new Date(), endedAt: null};
  const attempts = {
    claimActive: vi.fn(async () => ({attempt, disposition: "existing" as const})),
    getActive: vi.fn(async () => attempt),
    attachSession: vi.fn(async (_actor: Actor, _id: string, reference: CheckoutSessionReference) => {
      attempt = {...attempt, stripeCheckoutSessionId: reference.stripeCheckoutSessionId, checkoutUrl: reference.checkoutUrl};
      return attempt;
    }),
    startNewAttempt: vi.fn(async (_actor: unknown, _id: string, priceReference: string) => {
      attempt = {...attempt, id: "attempt-2", attemptNumber: 2,
        idempotencyKey: `membership-checkout:${membershipId}:2`, priceReference,
        stripeCheckoutSessionId: null, checkoutUrl: null};
      return attempt;
    }),
  };
  return {
    stripe,
    update,
    attempts,
    dependencies: {
      stripe,
      memberships: {getById: vi.fn().mockResolvedValue(record), getBillingAccess: vi.fn(async (actor: Actor) => {
        if (actor.kind !== "member") throw new Error("FORBIDDEN");
        if (record.ownerUserId === actor.userId) return record;
        const role = record.companyId ? actor.companyRoles?.[record.companyId] : undefined;
        if (role === "owner" || role === "admin") return record;
        throw new Error("FORBIDDEN");
      }), update},
      attempts,
      appUrl: "https://members.example.test",
      priceForPlan: () => "price_startup_test",
    },
  };
}

describe("membership checkout", () => {
  it("uses the same idempotency key for retries of one membership", async () => {
    const setup = dependencies();
    const actor = actorFor("user@example.test");
    await createCheckoutSession(actor, membershipId, "en", setup.dependencies);
    await createCheckoutSession(actor, membershipId, "en", setup.dependencies);
    expect(setup.stripe.checkoutRequests.map((request) => request.idempotencyKey)).toEqual([`membership-checkout:${membershipId}:1`]);
    expect(setup.attempts.attachSession).toHaveBeenCalledTimes(1);
  });

  it("uses opaque identifiers and configured return URLs without leaking PII", async () => {
    const setup = dependencies();
    await createCheckoutSession(actorFor("user@example.test"), membershipId, "en", setup.dependencies);
    expect(setup.stripe.checkoutRequests[0]).toMatchObject({
      clientReferenceId: membershipId,
      metadata: {membershipId, applicationId, planCode: "startup"},
      successUrl: `https://members.example.test/join/complete?membership_id=${membershipId}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `https://members.example.test/join/checkout?membership_id=${membershipId}`,
    });
    expect(JSON.stringify(setup.stripe.checkoutRequests[0])).not.toContain("user@example.test");
  });

  it("does not activate or update membership state from checkout creation", async () => {
    const setup = dependencies();
    await createCheckoutSession(actorFor("user@example.test"), membershipId, "en", setup.dependencies);
    expect(setup.update).not.toHaveBeenCalled();
  });

  it("prefixes both Stripe return URLs for the Chinese locale", async () => {
    const setup = dependencies();
    await createCheckoutSession(actorFor("user@example.test"), membershipId, "zh-HK", setup.dependencies);
    expect(setup.stripe.checkoutRequests[0]).toMatchObject({
      successUrl: `https://members.example.test/zh/join/complete?membership_id=${membershipId}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `https://members.example.test/zh/join/checkout?membership_id=${membershipId}`,
    });
  });
});

describe("billing ownership", () => {
  it("creates a portal only for the personal owner with a matching customer", async () => {
    const setup = dependencies(membership({status: "active", stripeCustomerId: "cus_owned"}));
    await expect(createBillingPortalSession(actorFor("user@example.test"), membershipId, setup.dependencies)).resolves.toEqual({url: setup.stripe.portalUrl});
    expect(setup.stripe.portalRequests[0]).toEqual({customerId: "cus_owned", returnUrl: "https://members.example.test/portal/billing"});
  });

  it("denies Billing Portal to a non-admin company member", async () => {
    const setup = dependencies(membership({ownerUserId: null, companyId: "company-a", status: "active", stripeCustomerId: "cus_company"}));
    await expect(createBillingPortalSession(actorFor("user-a", {"company-a": "member"}), membershipId, setup.dependencies)).rejects.toThrow("FORBIDDEN");
    expect(setup.stripe.portalRequests).toHaveLength(0);
  });

  it.each(["owner", "admin"] as const)("allows a company %s to open Billing Portal", async (role) => {
    const setup = dependencies(membership({ownerUserId: null, companyId: "company-a", status: "active", stripeCustomerId: "cus_company"}));
    await expect(createBillingPortalSession(actorFor("user-a", {"company-a": role}), membershipId, setup.dependencies)).resolves.toEqual({url: setup.stripe.portalUrl});
  });
});

describe("receipt mapping", () => {
  it("returns only deterministic safe invoice fields in Stripe order", async () => {
    const setup = dependencies(membership({status: "active", stripeCustomerId: "cus_owned"}));
    setup.stripe.invoices = [{
      id: "in_2", created: 1_720_000_100, amountPaid: 125_000, currency: "hkd", status: "paid",
      ...{customerEmail: "billing@example.test", description: "private memo"},
      hostedInvoiceUrl: "https://invoice.stripe.test/in_2",
    }, {
      id: "in_1", created: 1_720_000_000, amountPaid: 100_000, currency: "hkd", status: "open", hostedInvoiceUrl: null,
    }];
    const receipts = await listReceipts(actorFor("user@example.test"), membershipId, setup.dependencies);
    expect(receipts).toEqual([
      {id: "in_2", date: "2024-07-03T09:48:20.000Z", amount: 125_000, currency: "HKD", status: "paid", hostedInvoiceUrl: "https://invoice.stripe.test/in_2"},
      {id: "in_1", date: "2024-07-03T09:46:40.000Z", amount: 100_000, currency: "HKD", status: "open", hostedInvoiceUrl: null},
    ]);
    expect(JSON.stringify(receipts)).not.toContain("billing@example.test");
    expect(JSON.stringify(receipts)).not.toContain("private memo");
  });
});
