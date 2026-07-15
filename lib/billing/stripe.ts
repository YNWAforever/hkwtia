import "server-only";

import Stripe from "stripe";

import {serverEnv} from "@/lib/config/env";

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
  createCheckoutSession(input: CheckoutSessionInput): Promise<{url: string}>;
  createBillingPortalSession(input: PortalSessionInput): Promise<{url: string}>;
  listInvoices(customerId: string): Promise<InvoiceRecord[]>;
}

type StripeClient = {
  checkout: {sessions: {create(
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<Pick<Stripe.Checkout.Session, "url">>}};
  billingPortal: {sessions: {create(
    params: Stripe.BillingPortal.SessionCreateParams,
  ): Promise<Pick<Stripe.BillingPortal.Session, "url">>}};
  invoices: {list(
    params: Stripe.InvoiceListParams,
  ): Promise<{data: Array<Pick<Stripe.Invoice, "id" | "created" | "amount_paid" | "currency" | "status" | "hosted_invoice_url">>}>};
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
      return {url: session.url};
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
  productionAdapter ??= createStripeBillingAdapter(new Stripe(serverEnv().stripeSecretKey));
  return productionAdapter;
}
