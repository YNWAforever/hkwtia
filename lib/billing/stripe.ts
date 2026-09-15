import "server-only";

import Stripe from "stripe";

import {STRIPE_API_VERSION} from "@/lib/billing/stripe-api-version";
import {billingEnv} from "@/lib/config/env";

export type CheckoutMetadata = Readonly<{
  membershipId: string;
  applicationId: string;
  planCode: string;
}>;

export type CheckoutSessionInput = Readonly<{
  priceReference: string;
  clientReferenceId: string;
  metadata: CheckoutMetadata;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}>;

export type EventTicketSessionInput = Readonly<{
  eventTitle: string;
  amountHkdCents: number;
  seats: number;
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  expiresAt: Date;
}>;

export type PortalSessionInput = Readonly<{
  customerId: string;
  returnUrl: string;
}>;

export type InvoiceRecord = Readonly<{
  id: string;
  created: number;
  amountPaid: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
}>;

export interface StripeBillingAdapter {
  createCheckoutSession(input: CheckoutSessionInput): Promise<{id: string; url: string}>;
  createEventTicketSession(input: EventTicketSessionInput): Promise<{id: string; url: string}>;
  /** `idempotencyKey` makes a retried refund after a failed webhook safe to re-issue. */
  refundPaymentIntent(paymentIntentId: string, idempotencyKey: string): Promise<void>;
  createBillingPortalSession(input: PortalSessionInput): Promise<{url: string}>;
  listInvoices(customerId: string): Promise<InvoiceRecord[]>;
}

type StripeClient = {
  checkout: {sessions: {create(
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>}};
  billingPortal: {sessions: {create(
    params: Stripe.BillingPortal.SessionCreateParams,
  ): Promise<Pick<Stripe.BillingPortal.Session, "url">>}};
  invoices: {list(
    params: Stripe.InvoiceListParams,
  ): Promise<{data: Array<Pick<Stripe.Invoice, "id" | "created" | "amount_paid" | "currency" | "status" | "hosted_invoice_url">>}>};
  refunds: {create(params: {payment_intent: string}, options?: Stripe.RequestOptions): Promise<unknown>};
};

export function createStripeBillingAdapter(client: StripeClient): StripeBillingAdapter {
  return {
    async createCheckoutSession(input) {
      const session = await client.checkout.sessions.create({
        mode: "subscription",
        line_items: [{price: input.priceReference, quantity: 1}],
        client_reference_id: input.clientReferenceId,
        metadata: input.metadata,
        subscription_data: {metadata: input.metadata},
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }, {idempotencyKey: input.idempotencyKey});
      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return {id: session.id, url: session.url};
    },

    async createEventTicketSession(input) {
      const session = await client.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "hkd",
            unit_amount: input.amountHkdCents,
            product_data: {name: input.eventTitle},
          },
          quantity: input.seats,
        }],
        client_reference_id: input.orderId,
        // The kind discriminator is how the webhook tells a ticket from a
        // membership; the order id is the only other thing it trusts.
        metadata: {kind: "event_ticket", orderId: input.orderId},
        // Stripe's clock and ours agree on the hold, so an abandoned checkout
        // releases its seats at the same instant `heldSeats` stops counting them.
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }, {idempotencyKey: input.idempotencyKey});
      if (!session.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
      return {id: session.id, url: session.url};
    },

    async refundPaymentIntent(paymentIntentId, idempotencyKey) {
      await client.refunds.create({payment_intent: paymentIntentId}, {idempotencyKey});
    },

    async createBillingPortalSession(input) {
      const session = await client.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      });
      return {url: session.url};
    },

    async listInvoices(customerId) {
      const result = await client.invoices.list({customer: customerId, limit: 100});
      return result.data.map((invoice) => ({
        id: invoice.id,
        created: invoice.created,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      }));
    },
  };
}

let productionAdapter: StripeBillingAdapter | undefined;

export function stripeBillingAdapter(): StripeBillingAdapter {
  productionAdapter ??= createStripeBillingAdapter(
    new Stripe(billingEnv().stripeSecretKey, {apiVersion: STRIPE_API_VERSION}),
  );
  return productionAdapter;
}
