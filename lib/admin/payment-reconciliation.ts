import "server-only";

import {z} from "zod";
import type Stripe from "stripe";
import {forbidden, type Actor} from "@/lib/membership/lifecycle";
import {systemActor} from "@/lib/auth/authorize";
import type {Membership} from "@/lib/db/server-schema";
import {readPaymentCorrelation} from "@/lib/db/repos/billing-reconciliation";
import {jobsRepository, type ManualPaymentReconciliation} from "@/lib/db/repos/jobs";
import {membershipStripeEvent,stripeBillingAdapter} from "@/lib/billing/stripe";
import {normalizeMembershipStripeEvent,type WebhookLifecycleCommand} from "@/lib/billing/webhook-service";

export const paymentReconciliationSchema = z.object({
  requestId:z.string().uuid(),
  eventId:z.string().regex(/^evt_[A-Za-z0-9]{6,200}$/),
  reasonCode:z.enum(["paid_not_active","subscription_mismatch","webhook_retry"]),
}).strict();
export type PaymentReconciliationInput=z.infer<typeof paymentReconciliationSchema>;
export type PaymentReconciliationDependencies = Readonly<{
  readCorrelation:(actor:Actor,profileId:string,membershipId:string)=>Promise<Membership|null>;
  retrieveEvent:(id:string)=>Promise<Stripe.Event>;
  process:(command:WebhookLifecycleCommand,context:ManualPaymentReconciliation)=>Promise<"processed"|"duplicate">;
}>;
const defaultDependencies:PaymentReconciliationDependencies={
  readCorrelation:readPaymentCorrelation,
  retrieveEvent:membershipStripeEvent,
  process:(command,context)=>jobsRepository.processWebhookLifecycle(systemActor("stripe-webhook"),command,(id)=>stripeBillingAdapter().currentSubscription(id),context),
};

/** Replays an existing provider event through the existing transactional ledger. */
export async function reconcileMembershipPayment(actor:Actor,profileId:string,membershipId:string,input:PaymentReconciliationInput,dependencies:PaymentReconciliationDependencies=defaultDependencies):Promise<"processed"|"duplicate">{
  if(actor.kind!=="superadmin")forbidden();
  if (process.env.PAYMENT_RECONCILIATION_ENABLED !== "true") throw new Error("PAYMENT_RECONCILIATION_DISABLED");
  const parsed=paymentReconciliationSchema.parse(input);
  const membership=await dependencies.readCorrelation(actor,profileId,z.string().uuid().parse(membershipId));
  if(!membership)forbidden();
  const event=await dependencies.retrieveEvent(parsed.eventId);
  if(event.id!==parsed.eventId)throw new Error("PAYMENT_EVENT_CORRELATION_FAILED");
  const command=normalizeMembershipStripeEvent(event);
  if(!command||command.membershipId!==membership.id||command.applicationId!==membership.applicationId||command.planCode!==membership.planCode)throw new Error("PAYMENT_EVENT_CORRELATION_FAILED");
  // Existing lifecycle repository also verifies customer/subscription/session,
  // locked source status, active attempt and event ordering before any mutation.
  return dependencies.process(command,{actor,requestId:parsed.requestId,reasonCode:parsed.reasonCode});
}
