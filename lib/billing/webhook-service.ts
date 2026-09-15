import "server-only";
import type Stripe from "stripe";
import {z} from "zod";
import {requireSystem} from "@/lib/membership/lifecycle";
import {jobsRepository} from "@/lib/db/repos/jobs";
import type {Actor, MembershipPlanCode, MembershipStatus} from "@/lib/membership/lifecycle";

const supportedEventTypes = ["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted"] as const;
export type SupportedStripeEventType = typeof supportedEventTypes[number];
export type WebhookLifecycleCommand = Readonly<{eventId: string; eventType: SupportedStripeEventType; eventCreated: number; membershipId: string; applicationId: string; planCode: MembershipPlanCode; stripeCustomerId: string; stripeSubscriptionId: string; stripeCheckoutSessionId: string | null; nextStatus: MembershipStatus; billingPeriodStart: Date | null; billingPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; isRenewal: boolean}>;
export interface WebhookProcessor { process(actor: Actor, command: WebhookLifecycleCommand): Promise<"processed" | "duplicate">; }
export type TicketWebhookCommand = Readonly<{
  eventId: string; eventType: "checkout.session.completed" | "checkout.session.expired";
  orderId: string; checkoutSessionId: string; paymentIntentId: string | null;
}>;
export interface TicketProcessor { process(actor: Actor, command: TicketWebhookCommand): Promise<"processed" | "duplicate">; }
export class WebhookInputError extends Error { readonly code = "INVALID_WEBHOOK_EVENT"; constructor() { super("INVALID_WEBHOOK_EVENT"); this.name = "WebhookInputError"; } }
const metadataSchema = z.object({membershipId: z.string().uuid(), applicationId: z.string().uuid(), planCode: z.enum(["community", "startup", "corporate", "patron"])}).strict();
type StripeObject = Record<string, unknown>;
function objectValue(value: unknown): StripeObject { if (!value || typeof value !== "object") throw new WebhookInputError(); return value as StripeObject; }
function stringId(value: unknown): string { if (typeof value === "string" && value.length > 0) return value; if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id; throw new WebhookInputError(); }
function subscriptionDetails(value: unknown): StripeObject | undefined { return value && typeof value === "object" && "subscription_details" in value ? (value.subscription_details as StripeObject) : undefined; }
function metadataFor(type: SupportedStripeEventType, object: StripeObject) { const value = type === "checkout.session.completed" || type.startsWith("customer.subscription.") ? object.metadata : objectValue(object.subscription_details ?? subscriptionDetails(object.parent)).metadata; const parsed = metadataSchema.safeParse(value); if (!parsed.success) throw new WebhookInputError(); return parsed.data; }
function unixDate(value: unknown): Date | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? new Date(value * 1000) : null; }
function firstSubscriptionItem(object: StripeObject): StripeObject | undefined {
  const items = object.items;
  const data = items && typeof items === "object" && "data" in items ? (items as {data: unknown}).data : undefined;
  const first = Array.isArray(data) ? data[0] : undefined;
  return first && typeof first === "object" ? first as StripeObject : undefined;
}
/**
 * Subscription objects carry the billing period on their items as of API
 * version 2026-06-24.dahlia; invoices still expose `period_start`/`period_end`.
 * The top-level subscription fields remain as a fallback for endpoints still
 * pinned to an older version.
 */
function billingPeriod(eventType: SupportedStripeEventType, object: StripeObject): {start: unknown; end: unknown} {
  if (!eventType.startsWith("customer.subscription.")) return {start: object.period_start, end: object.period_end};
  const item = firstSubscriptionItem(object);
  return {
    start: item?.current_period_start ?? object.current_period_start,
    end: item?.current_period_end ?? object.current_period_end,
  };
}
function subscriptionStatus(object: StripeObject): {status: MembershipStatus; cancelAtPeriodEnd: boolean} { const status = object.status; const cancelling = object.cancel_at_period_end === true; if (status === "canceled") return {status: "cancelled", cancelAtPeriodEnd: false}; if (status === "past_due" || status === "unpaid") return {status: "past_due", cancelAtPeriodEnd: cancelling}; if (status === "active" || status === "trialing") return {status: cancelling ? "cancel_at_period_end" : "active", cancelAtPeriodEnd: cancelling}; throw new WebhookInputError(); }
function normalize(event: Stripe.Event): WebhookLifecycleCommand | null {
  if (!(supportedEventTypes as readonly string[]).includes(event.type)) return null;
  const eventType = event.type as SupportedStripeEventType; const object = objectValue(event.data?.object); const metadata = metadataFor(eventType, object);
  if (metadata.planCode !== "startup" && metadata.planCode !== "corporate") throw new WebhookInputError();
  const customerId = stringId(object.customer); const details = subscriptionDetails(object.parent); const subscriptionId = eventType.startsWith("customer.subscription.") ? stringId(object.id) : stringId(object.subscription ?? details?.subscription);
  let nextStatus: MembershipStatus; let cancelAtPeriodEnd = false;
  if (eventType === "invoice.payment_failed") nextStatus = "past_due"; else if (eventType === "customer.subscription.deleted") nextStatus = "cancelled"; else if (eventType === "customer.subscription.updated") { const mapped = subscriptionStatus(object); nextStatus = mapped.status; cancelAtPeriodEnd = mapped.cancelAtPeriodEnd; } else nextStatus = "active";
  const stripeCheckoutSessionId = eventType === "checkout.session.completed" ? stringId(object.id) : null;
  const isRenewal = (eventType === "invoice.paid" || eventType === "invoice.payment_failed") && object.billing_reason === "subscription_cycle";
  const period = billingPeriod(eventType, object);
  const billingPeriodStart = unixDate(period.start);
  const billingPeriodEnd = unixDate(period.end);
  if (isRenewal && (!billingPeriodStart || !billingPeriodEnd || billingPeriodEnd <= billingPeriodStart)) throw new WebhookInputError();
  if (eventType === "checkout.session.completed" && object.payment_status !== "paid") throw new WebhookInputError();
  if (eventType === "checkout.session.completed" && object.client_reference_id !== metadata.membershipId) throw new WebhookInputError();
  return {eventId: event.id, eventType, eventCreated: event.created, ...metadata, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId, nextStatus, billingPeriodStart, billingPeriodEnd, cancelAtPeriodEnd, isRenewal};
}
function normalizeTicket(event: Stripe.Event): TicketWebhookCommand | null {
  // `completed` alone is not proof of payment: with a delayed-notification
  // payment method Stripe sends it with `payment_status: "unpaid"` and settles
  // later via `async_payment_succeeded`. Settling on the first would mail a
  // receipt and take seats for money that never arrived, so both arms require
  // `payment_status === "paid"` and the async success is accepted as the
  // completion it is. The membership lane guards the same field.
  const completed = event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded";
  const expired = event.type === "checkout.session.expired";
  if (!completed && !expired) return null;
  const object = objectValue(event.data?.object);
  if (completed && object.payment_status !== "paid") return null;
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || (metadata as Record<string, unknown>).kind !== "event_ticket") return null;
  const parsed = z.object({kind: z.literal("event_ticket"), orderId: z.string().uuid()}).strict().safeParse(metadata);
  if (!parsed.success) throw new WebhookInputError();
  const checkoutSessionId = stringId(object.id);
  if (object.client_reference_id !== parsed.data.orderId) throw new WebhookInputError();
  return {
    eventId: event.id, eventType: completed ? "checkout.session.completed" : "checkout.session.expired",
    orderId: parsed.data.orderId, checkoutSessionId,
    paymentIntentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
  };
}
const productionProcessor: WebhookProcessor = {process: (actor, command) => jobsRepository.processWebhookLifecycle(actor, command)};
export async function processStripeEvent(
  event: Stripe.Event,
  actor: Actor,
  processor: WebhookProcessor = productionProcessor,
  ticketProcessor: TicketProcessor | null = null,
): Promise<"processed" | "duplicate"> {
  requireSystem(actor);
  const ticket = normalizeTicket(event);
  if (ticket) {
    if (!ticketProcessor) return "processed";
    try { return await ticketProcessor.process(actor, ticket); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "INVALID_WEBHOOK_EVENT") throw new WebhookInputError(); throw error; }
  }
  const command = normalize(event);
  if (!command) return "processed";
  try { return await processor.process(actor, command); }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "INVALID_WEBHOOK_EVENT") throw new WebhookInputError(); throw error; }
}
