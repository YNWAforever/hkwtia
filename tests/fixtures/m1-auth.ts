import {createHmac, timingSafeEqual} from "node:crypto";

export type M1PlanCode = "community" | "startup" | "corporate" | "patron";
export type M1MembershipStatus = "pending_payment" | "active" | "past_due" | "cancel_at_period_end" | "cancelled";
export type M1TestUser = Readonly<{id: string; email: string}>;
export type M1TestCompany = Readonly<{id: string; name: string; seatLimit: number}>;
export type M1TestSubscription = Readonly<{customerId: string; subscriptionId: string; planCode: M1PlanCode; status: M1MembershipStatus}>;
export type M1CheckoutRequest = Readonly<{clientReferenceId: string; idempotencyKey: string; metadata: {membershipId: string; applicationId: string; planCode: M1PlanCode}}>;
export type M1CheckoutResult = Readonly<{kind: "checkout" | "free" | "review"; url?: string; sessionId?: string; customerId: string; planCode: M1PlanCode}>;

/** Credential-free browser adapter. Service-level behavior is covered by Vitest; live Neon/Stripe remains separately gated. */
export type M1AcceptanceFixture = {
  user: M1TestUser;
  company: M1TestCompany;
  subscription: M1TestSubscription;
  membershipStatus: M1MembershipStatus;
  seatsUsed: number;
  seatLimit: number;
  replayedEventIds: Set<string>;
  checkoutRequests: M1CheckoutRequest[];
  portalRequests: Array<{customerId: string; returnUrl: string}>;
  startCheckout(): Promise<M1CheckoutResult>;
  applyWebhook(eventId: string, status?: M1MembershipStatus): Promise<"processed" | "duplicate">;
  inviteSeat(): Promise<"invited" | "seat_limit_reached">;
  billingPortal(userId: string): Promise<{url: string} | "forbidden">;
};

const DEFAULT_SECRET = "m1-acceptance-test-secret";

export function createSignedWebhookFixture(payload: string, secret = process.env.STRIPE_TEST_WEBHOOK_SECRET || DEFAULT_SECRET, timestamp = 1_784_156_400): {payload: string; signature: string} {
  const signedPayload = `${timestamp}.${payload}`;
  const digest = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return {payload, signature: `t=${timestamp},v1=${digest}`};
}

export function verifySignedWebhookFixture(fixture: {payload: string; signature: string}, secret = process.env.STRIPE_TEST_WEBHOOK_SECRET || DEFAULT_SECRET): boolean {
  const [timestampPart, signaturePart] = fixture.signature.split(",");
  const timestamp = timestampPart?.replace(/^t=/, "");
  const received = signaturePart?.replace(/^v1=/, "");
  if (!timestamp || !received || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${fixture.payload}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export function createM1AcceptanceFixture(planCode: M1PlanCode = "startup"): M1AcceptanceFixture {
  const user = {id: "user_m1_acceptance", email: "m1-acceptance@example.test"};
  const company = {id: "company_m1_acceptance", name: "M1 Acceptance Company", seatLimit: planCode === "startup" ? 5 : planCode === "corporate" ? 25 : 1};
  const subscription = {customerId: "cus_m1_acceptance", subscriptionId: "sub_m1_acceptance", planCode, status: "pending_payment" as M1MembershipStatus};
  const membershipId = "11111111-1111-4111-8111-111111111111";
  const applicationId = "22222222-2222-4222-8222-222222222222";
  const replayedEventIds = new Set<string>();
  const checkoutRequests: M1CheckoutRequest[] = [];
  const portalRequests: Array<{customerId: string; returnUrl: string}> = [];
  let membershipStatus: M1MembershipStatus = "pending_payment";
  let pendingSeats = 0;

  return {
    user,
    company,
    subscription,
    get membershipStatus() { return membershipStatus; },
    get seatsUsed() { return 1 + pendingSeats; },
    get seatLimit() { return company.seatLimit; },
    replayedEventIds,
    checkoutRequests,
    portalRequests,
    async startCheckout() {
      if (planCode === "community") return {kind: "free", customerId: subscription.customerId, planCode};
      if (planCode === "patron") return {kind: "review", customerId: subscription.customerId, planCode};
      checkoutRequests.push({clientReferenceId: membershipId, idempotencyKey: `membership-checkout:${membershipId}:1`, metadata: {membershipId, applicationId, planCode}});
      return {kind: "checkout", url: "https://checkout.stripe.test/cs_m1_acceptance", sessionId: "cs_m1_acceptance", customerId: subscription.customerId, planCode};
    },
    async applyWebhook(eventId, status = "active") {
      const signed = createSignedWebhookFixture(JSON.stringify({eventId, status}));
      if (!verifySignedWebhookFixture(signed)) throw new Error("INVALID_TEST_SIGNATURE");
      if (replayedEventIds.has(eventId)) return "duplicate";
      replayedEventIds.add(eventId);
      membershipStatus = status;
      subscription.status = status;
      return "processed";
    },
    async inviteSeat() {
      if (1 + pendingSeats >= company.seatLimit) return "seat_limit_reached";
      pendingSeats += 1;
      return "invited";
    },
    async billingPortal(userId) {
      if (membershipStatus !== "active" || userId !== user.id) return "forbidden";
      const request = {customerId: subscription.customerId, returnUrl: "https://m1-acceptance.example.test/portal/billing"};
      portalRequests.push(request);
      return {url: "https://billing.stripe.test/session"};
    },
  };
}
