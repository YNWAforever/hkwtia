import type {Actor} from "@/lib/membership/lifecycle";
import type {
  CheckoutSessionInput,
  InvoiceRecord,
  PortalSessionInput,
  StripeBillingAdapter,
} from "@/lib/billing/stripe";
import {createFakeRepositories as makeRepositories} from "@/tests/helpers/repository-fakes";

export const actorFor = (userId: string, companyRoles?: Readonly<Record<string, "owner" | "admin" | "member">>): Actor => ({
  kind: "member",
  userId,
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
  readonly portalRequests: PortalSessionInput[] = [];
  invoices: InvoiceRecord[] = [];
  checkoutUrl = "https://checkout.stripe.test/session";
  portalUrl = "https://billing.stripe.test/session";

  async createCheckoutSession(input: CheckoutSessionInput): Promise<{url: string}> {
    this.checkoutRequests.push(structuredClone(input));
    return {url: this.checkoutUrl};
  }

  async createBillingPortalSession(input: PortalSessionInput): Promise<{url: string}> {
    this.portalRequests.push(structuredClone(input));
    return {url: this.portalUrl};
  }

  async listInvoices(): Promise<InvoiceRecord[]> {
    return structuredClone(this.invoices);
  }
}
