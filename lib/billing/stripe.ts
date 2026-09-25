import "server-only";

import Stripe from "stripe";

import {STRIPE_API_VERSION} from "@/lib/billing/stripe-api-version";
import {billingEnv} from "@/lib/config/env";
import type {MembershipStatus} from "@/lib/membership/lifecycle";

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
  /**
   * The PER-SEAT price. Stripe multiplies `unit_amount` by `quantity`, so
   * passing an order total here charges the buyer `price × seats²`. The order's
   * total is `amount_hkd_cents`; this is the unit.
   */
  unitAmountHkdCents: number;
  seats: number;
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  /** Must be at least 30 minutes after session CREATION, so it carries a margin. */
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

export type CurrentSubscriptionState = Readonly<{
  stripeSubscriptionId: string; stripeCustomerId: string; nextStatus: MembershipStatus;
  cancelAtPeriodEnd: boolean; billingPeriodStart: Date | null; billingPeriodEnd: Date | null;
}>;
export class RefundPendingError extends Error {
  readonly code = "STRIPE_REFUND_PENDING";
  constructor() { super("STRIPE_REFUND_NOT_SUCCEEDED"); }
}
export interface StripeBillingAdapter {
  createCheckoutSession(input: CheckoutSessionInput): Promise<{id: string; url: string}>;
  currentSubscription(subscriptionId: string): Promise<CurrentSubscriptionState>;
  createEventTicketSession(input: EventTicketSessionInput): Promise<{id: string; url: string}>;
  /** The intent to refund for a settled session; `null` when the session has none. */
  paymentIntentForSession(sessionId: string): Promise<string | null>;
  ticketOrderIdForPaymentIntent(paymentIntentId: string): Promise<string | null>;
  /** `idempotencyKey` makes a retried refund after a failed webhook safe to re-issue. */
  refundPaymentIntent(paymentIntentId: string, idempotencyKey: string, options?: {requireSucceeded?: boolean; orderId?: string; refundReason?: "staff" | "cancelled"}): Promise<void>;
  /** Prove a lost commit against the provider before recording a refund locally. */
  fullyRefundedPaymentIntent(paymentIntentId: string, expectedAmountHkdCents: number): Promise<boolean>;
  createBillingPortalSession(input: PortalSessionInput): Promise<{url: string}>;
  listInvoices(customerId: string): Promise<InvoiceRecord[]>;
}

type StripeClient = {
  checkout: {sessions: {
    create(
      params: Stripe.Checkout.SessionCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    retrieve(id: string): Promise<Pick<Stripe.Checkout.Session, "payment_intent">>;
    list(params: {payment_intent: string; limit: number}): Promise<{data: Array<Pick<Stripe.Checkout.Session, "id" | "metadata" | "client_reference_id" | "payment_intent">>; has_more: boolean}>;
  }};
  billingPortal: {sessions: {create(
    params: Stripe.BillingPortal.SessionCreateParams,
  ): Promise<Pick<Stripe.BillingPortal.Session, "url">>}};
  subscriptions: {retrieve(id: string): Promise<Pick<Stripe.Subscription, "id" | "customer" | "status" | "cancel_at_period_end" | "items">>};
  invoices: {list(
    params: Stripe.InvoiceListParams,
  ): Promise<{data: Array<Pick<Stripe.Invoice, "id" | "created" | "amount_paid" | "currency" | "status" | "hosted_invoice_url">>}>};
  refunds: {
    create(params: {payment_intent: string; metadata?: {eventOrderId: string}}, options?: Stripe.RequestOptions): Promise<Pick<Stripe.Refund, "status">>;
    list(params: {payment_intent: string; limit: number}): Promise<{data: Array<Pick<Stripe.Refund, "status" | "currency" | "amount">>; has_more: boolean}>;
  };
  paymentIntents: {retrieve(id: string, params: {expand: string[]}): Promise<Pick<Stripe.PaymentIntent, "id" | "status" | "currency" | "amount_received" | "latest_charge">>};
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

    async currentSubscription(subscriptionId) {
      const subscription = await client.subscriptions.retrieve(subscriptionId);
      if (subscription.id !== subscriptionId) throw new Error("STRIPE_SUBSCRIPTION_MISMATCH");
      const stripeCustomerId = typeof subscription.customer === "string"
        ? subscription.customer : subscription.customer.id;
      if (!stripeCustomerId) throw new Error("STRIPE_CUSTOMER_MISSING");
      const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
      let nextStatus: MembershipStatus;
      if (subscription.status === "canceled") nextStatus = "cancelled";
      else if (subscription.status === "past_due" || subscription.status === "unpaid") nextStatus = "past_due";
      else if (subscription.status === "active" || subscription.status === "trialing") {
        nextStatus = cancelAtPeriodEnd ? "cancel_at_period_end" : "active";
      } else throw new Error("STRIPE_SUBSCRIPTION_STATUS_UNSUPPORTED");
      const item = subscription.items.data[0];
      const start = item?.current_period_start;
      const end = item?.current_period_end;
      const billingPeriodStart = Number.isSafeInteger(start) && start >= 0 ? new Date(start * 1000) : null;
      const billingPeriodEnd = Number.isSafeInteger(end) && end >= 0 ? new Date(end * 1000) : null;
      return {stripeSubscriptionId: subscription.id, stripeCustomerId, nextStatus,
        cancelAtPeriodEnd: nextStatus === "cancelled" ? false : cancelAtPeriodEnd,
        billingPeriodStart, billingPeriodEnd};
    },

    async createEventTicketSession(input) {
      const session = await client.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "hkd",
            unit_amount: input.unitAmountHkdCents,
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

    async paymentIntentForSession(sessionId) {
      const session = await client.checkout.sessions.retrieve(sessionId);
      const intent = session.payment_intent;
      // Stripe returns either the id or the expanded object.
      return typeof intent === "string" ? intent : intent?.id ?? null;
    },

    async ticketOrderIdForPaymentIntent(paymentIntentId) {
      const sessions = await client.checkout.sessions.list({payment_intent: paymentIntentId, limit: 2});
      if (sessions.has_more || sessions.data.length > 1) throw new Error("STRIPE_CHECKOUT_AMBIGUOUS");
      const session = sessions.data[0];
      if (!session) return null;
      if (session.metadata?.kind !== "event_ticket") return null;
      const orderId = session.metadata?.orderId;
      const intent = session.payment_intent;
      const intentId = typeof intent === "string" ? intent : intent?.id;
      if (typeof orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
          session.client_reference_id !== orderId || intentId !== paymentIntentId) {
        throw new Error("STRIPE_CHECKOUT_CORRELATION_FAILED");
      }
      return orderId;
    },

    async refundPaymentIntent(paymentIntentId, idempotencyKey, options) {
      const refund = await client.refunds.create({payment_intent: paymentIntentId,
        ...(options?.orderId ? {metadata: {eventOrderId: options.orderId, ...(options.refundReason ? {eventOrderRefundReason: options.refundReason} : {})}} : {})}, {idempotencyKey});
      // refundOrder keeps paid orders until provider success. The existing
      // oversold webhook has its own retry contract and opts out.
      if (options?.requireSucceeded && refund.status !== "succeeded") {
        if (refund.status === "pending" || refund.status === "requires_action") throw new RefundPendingError();
        throw new Error("STRIPE_REFUND_NOT_SUCCEEDED");
      }
    },

    async fullyRefundedPaymentIntent(paymentIntentId, expectedAmountHkdCents) {
      const intent = await client.paymentIntents.retrieve(paymentIntentId, {expand: ["latest_charge"]});
      if (intent.id !== paymentIntentId || intent.status !== "succeeded" || intent.currency !== "hkd" ||
          intent.amount_received !== expectedAmountHkdCents) {
        throw new Error("STRIPE_REFUND_AMOUNT_MISMATCH");
      }
      const charge = intent.latest_charge;
      if (!charge || typeof charge === "string" || !("amount_refunded" in charge) ||
          charge.currency !== "hkd" || charge.amount_captured !== expectedAmountHkdCents) {
        throw new Error("STRIPE_REFUND_CHARGE_UNVERIFIED");
      }
      if (charge.amount_refunded !== expectedAmountHkdCents) return false;
      // The charge aggregate can include a refund that has not succeeded.
      // Only a complete, currently succeeded refund set can repair a lost commit.
      const refunds = await client.refunds.list({payment_intent: paymentIntentId, limit: 100});
      if (refunds.has_more) throw new Error("STRIPE_REFUNDS_UNVERIFIED");
      if (refunds.data.some((refund) => !["succeeded", "failed", "canceled"].includes(refund.status ?? ""))) return false;
      const succeeded = refunds.data.filter((refund) => refund.status === "succeeded");
      return succeeded.every((refund) => refund.currency === "hkd") &&
        succeeded.reduce((total, refund) => total + refund.amount, 0) === expectedAmountHkdCents;
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
