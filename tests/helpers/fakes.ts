import type {Actor} from "@/lib/membership/lifecycle";
import type {
  CheckoutSessionInput,
  EventTicketSessionInput,
  InvoiceRecord,
  PortalSessionInput,
  StripeBillingAdapter,
} from "@/lib/billing/stripe";
import {createFakeRepositories as makeRepositories} from "@/tests/helpers/repository-fakes";

export const actorFor = (userId: string, companyRoles?: Readonly<Record<string, "owner" | "admin" | "member">>): Actor => ({
  kind: "member",
  userId,

  profileId: userId,
  companyRoles,
});

export const anonymousActor = (): Actor => ({kind: "anonymous", userId: null});

export const systemActor = (): Actor => ({kind: "system", userId: null, source: "stripe-webhook"});

export const membershipOwnedBy = (companyId: string, id = "membership-company-b") => ({
  id,
  ownerUserId: null,
  companyId,
  planCode: "corporate" as const,
  status: "active" as const,
  seatLimit: 10,
});

export function createFakeRepositories() {
  return makeRepositories({
    memberships: [
      membershipOwnedBy("company-a", "membership-company-a"),
      membershipOwnedBy("company-b", "membership-company-b"),
    ],
    companyMembers: [
      {id: "member-a", companyId: "company-a", userId: "user-a", role: "member", revokedAt: null},
    ],
  });
}

export class FakeStripeBillingAdapter implements StripeBillingAdapter {
  readonly checkoutRequests: CheckoutSessionInput[] = [];
  readonly ticketRequests: EventTicketSessionInput[] = [];
  readonly portalRequests: PortalSessionInput[] = [];
  readonly refundedPaymentIntents: string[] = [];
  readonly refundStateQueries: Array<{paymentIntentId: string; expectedAmountHkdCents: number}> = [];
  paymentIntentId: string | null = "pi_test_intent";
  invoices: InvoiceRecord[] = [];
  checkoutSessionId = "cs_test_session";
  checkoutUrl = "https://checkout.stripe.test/session";
  ticketSessionId = "cs_test_ticket";
  ticketUrl = "https://checkout.stripe.test/ticket";
  portalUrl = "https://billing.stripe.test/session";

  async createCheckoutSession(input: CheckoutSessionInput): Promise<{id: string; url: string}> {
    this.checkoutRequests.push(structuredClone(input));
    return {id: this.checkoutSessionId, url: this.checkoutUrl};
  }

  async createEventTicketSession(input: EventTicketSessionInput): Promise<{id: string; url: string}> {
    this.ticketRequests.push(structuredClone(input));
    return {id: this.ticketSessionId, url: this.ticketUrl};
  }

  async paymentIntentForSession(_sessionId: string): Promise<string | null> {
    return this.paymentIntentId;
  }

  async refundPaymentIntent(paymentIntentId: string, _idempotencyKey: string): Promise<void> {
    this.refundedPaymentIntents.push(paymentIntentId);
  }

  async fullyRefundedPaymentIntent(paymentIntentId: string, expectedAmountHkdCents: number): Promise<boolean> {
    this.refundStateQueries.push({paymentIntentId, expectedAmountHkdCents});
    return false;
  }

  async createBillingPortalSession(input: PortalSessionInput): Promise<{url: string}> {
    this.portalRequests.push(structuredClone(input));
    return {url: this.portalUrl};
  }

  async listInvoices(): Promise<InvoiceRecord[]> {
    return structuredClone(this.invoices);
  }
}
