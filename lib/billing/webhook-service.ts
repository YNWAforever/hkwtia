import "server-only";
import type Stripe from "stripe";
import {z} from "zod";
import {requireSystem} from "@/lib/membership/lifecycle";
import {jobsRepository} from "@/lib/db/repos/jobs";
import type {Actor, MembershipPlanCode, MembershipStatus} from "@/lib/membership/lifecycle";

const supportedEventTypes = ["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted"] as const;
export type SupportedStripeEventType = typeof supportedEventTypes[number];
export type WebhookLifecycleCommand = Readonly<{eventId: string; eventType: SupportedStripeEventType; eventCreated: number; membershipId: string; applicationId: string; planCode: MembershipPlanCode; stripeCustomerId: string; stripeSubscriptionId: string; stripeCheckoutSessionId: string | null; nextStatus: MembershipStatus; billingPeriodStart: Date | null; billingPeriodEnd: Date | null; cancelAtPeriodEnd: boolean}>;
export interface WebhookProcessor { process(actor: Actor, command: WebhookLifecycleCommand): Promise<"processed" | "duplicate">; }
export class WebhookInputError extends Error { readonly code = "INVALID_WEBHOOK_EVENT"; constructor() { super("INVALID_WEBHOOK_EVENT"); this.name = "WebhookInputError"; } }
const metadataSchema = z.object({membershipId: z.string().uuid(), applicationId: z.string().uuid(), planCode: z.enum(["community", "startup", "corporate", "patron"])}).strict();
type StripeObject = Record<string, unknown>;
function objectValue(value: unknown): StripeObject { if (!value || typeof value !== "object") throw new WebhookInputError(); return value as StripeObject; }
function stringId(value: unknown): string { if (typeof value === "string" && value.length > 0) return value; if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id; throw new WebhookInputError(); }
function subscriptionDetails(value: unknown): StripeObject | undefined { return value && typeof value === "object" && "subscription_details" in value ? (value.subscription_details as StripeObject) : undefined; }
function metadataFor(type: SupportedStripeEventType, object: StripeObject) { const value = type === "checkout.session.completed" || type.startsWith("customer.subscription.") ? object.metadata : objectValue(object.subscription_details ?? subscriptionDetails(object.parent)).metadata; const parsed = metadataSchema.safeParse(value); if (!parsed.success) throw new WebhookInputError(); return parsed.data; }
function unixDate(value: unknown): Date | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? new Date(value * 1000) : null; }
function subscriptionStatus(object: StripeObject): {status: MembershipStatus; cancelAtPeriodEnd: boolean} { const status = object.status; const cancelling = object.cancel_at_period_end === true; if (status === "canceled") return {status: "cancelled", cancelAtPeriodEnd: false}; if (status === "past_due" || status === "unpaid") return {status: "past_due", cancelAtPeriodEnd: cancelling}; if (status === "active" || status === "trialing") return {status: cancelling ? "cancel_at_period_end" : "active", cancelAtPeriodEnd: cancelling}; throw new WebhookInputError(); }
function normalize(event: Stripe.Event): WebhookLifecycleCommand | null {
  if (!(supportedEventTypes as readonly string[]).includes(event.type)) return null;
  const eventType = event.type as SupportedStripeEventType; const object = objectValue(event.data?.object); const metadata = metadataFor(eventType, object);
  if (metadata.planCode !== "startup" && metadata.planCode !== "corporate") throw new WebhookInputError();
  const customerId = stringId(object.customer); const details = subscriptionDetails(object.parent); const subscriptionId = eventType.startsWith("customer.subscription.") ? stringId(object.id) : stringId(object.subscription ?? details?.subscription);
  let nextStatus: MembershipStatus; let cancelAtPeriodEnd = false;
  if (eventType === "invoice.payment_failed") nextStatus = "past_due"; else if (eventType === "customer.subscription.deleted") nextStatus = "cancelled"; else if (eventType === "customer.subscription.updated") { const mapped = subscriptionStatus(object); nextStatus = mapped.status; cancelAtPeriodEnd = mapped.cancelAtPeriodEnd; } else nextStatus = "active";
  const stripeCheckoutSessionId = eventType === "checkout.session.completed" ? stringId(object.id) : null;
  if (eventType === "checkout.session.completed" && object.payment_status !== "paid") throw new WebhookInputError();
  if (eventType === "checkout.session.completed" && object.client_reference_id !== metadata.membershipId) throw new WebhookInputError();
  return {eventId: event.id, eventType, eventCreated: event.created, ...metadata, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId, stripeCheckoutSessionId, nextStatus, billingPeriodStart: unixDate(object.current_period_start ?? object.period_start), billingPeriodEnd: unixDate(object.current_period_end ?? object.period_end), cancelAtPeriodEnd};
}
const productionProcessor: WebhookProcessor = {process: (actor, command) => jobsRepository.processWebhookLifecycle(actor, command)};
export async function processStripeEvent(event: Stripe.Event, actor: Actor, processor: WebhookProcessor = productionProcessor): Promise<"processed" | "duplicate"> { requireSystem(actor); const command = normalize(event); if (!command) return "processed"; try { return await processor.process(actor, command); } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "INVALID_WEBHOOK_EVENT") throw new WebhookInputError(); throw error; } }
