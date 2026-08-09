import "server-only";

import Stripe from "stripe";

import {STRIPE_API_VERSION} from "@/lib/billing/stripe-api-version";
import {processStripeEvent, WebhookInputError} from "@/lib/billing/webhook-service";
import {billingEnv} from "@/lib/config/env";
import type {Actor} from "@/lib/membership/lifecycle";

type Dependencies = Readonly<{
  constructEvent(rawBody: string, signature: string): Stripe.Event;
  processEvent(event: Stripe.Event): Promise<"processed" | "duplicate">;
}>;

export function createWebhookPost(dependencies: Dependencies) {
  return async function post(request: Request): Promise<Response> {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return Response.json({error: "INVALID_SIGNATURE"}, {status: 400});

    const rawBody = await request.text();
    let event: Stripe.Event;
    try {
      event = dependencies.constructEvent(rawBody, signature);
    } catch {
      return Response.json({error: "INVALID_SIGNATURE"}, {status: 400});
    }

    try {
      const result = await dependencies.processEvent(event);
      return Response.json({received: true, result}, {status: 200});
    } catch (error) {
      if (error instanceof WebhookInputError) {
        return Response.json({error: error.code}, {status: 400});
      }
      return Response.json({error: "WEBHOOK_PROCESSING_FAILED"}, {status: 500});
    }
  };
}

let stripe: Stripe | undefined;
const stripeWebhookActor: Actor = {
  kind: "system",
  userId: null,
  source: "stripe-webhook",
};

function stripeClient(): Stripe {
  stripe ??= new Stripe(billingEnv().stripeSecretKey, {apiVersion: STRIPE_API_VERSION});
  return stripe;
}

export const POST = createWebhookPost({
  constructEvent(rawBody, signature) {
    return stripeClient().webhooks.constructEvent(rawBody, signature, billingEnv().stripeWebhookSecret);
  },
  processEvent(event) {
    return processStripeEvent(event, stripeWebhookActor);
  },
});
