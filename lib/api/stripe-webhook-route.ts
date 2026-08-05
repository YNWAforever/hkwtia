import "server-only";

import Stripe from "stripe";

import {systemActor} from "@/lib/auth/actor";
import {processStripeEvent, WebhookInputError} from "@/lib/billing/webhook-service";
import {serverEnv} from "@/lib/config/env";

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

function stripeClient(): Stripe {
  stripe ??= new Stripe(serverEnv().stripeSecretKey);
  return stripe;
}

export const POST = createWebhookPost({
  constructEvent(rawBody, signature) {
    return stripeClient().webhooks.constructEvent(rawBody, signature, serverEnv().stripeWebhookSecret);
  },
  processEvent(event) {
    return processStripeEvent(event, systemActor("stripe-webhook"));
  },
});
