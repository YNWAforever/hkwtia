import "server-only";

import Stripe from "stripe";

import {STRIPE_API_VERSION} from "@/lib/billing/stripe-api-version";
import {stripeBillingAdapter} from "@/lib/billing/stripe";
import {createTicketProcessor} from "@/lib/billing/ticket-webhook-processor";
import {processStripeEvent, WebhookInputError} from "@/lib/billing/webhook-service";
import type {TicketProcessor} from "@/lib/billing/webhook-service";
import {billingEnv, emailEnv, appEnv} from "@/lib/config/env";
import {eventOrdersRepository} from "@/lib/db/repos/event-orders";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
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

let builtTicketProcessor: TicketProcessor | undefined;

/**
 * Built once, lazily, beside the Stripe client.
 *
 * "Lazily" is load-bearing twice. Its dependencies read `emailEnv()` and
 * `appEnv()`, which enforce production credentials, so constructing it while
 * merely wiring the membership lane would make a membership webhook depend on
 * email configuration it never uses — and the route test that stubs only the
 * billing contract would answer 500. Deferring to the first ticket event also
 * means the membership lane never touches the ticket machinery at all.
 */
function buildTicketProcessor(): TicketProcessor {
  builtTicketProcessor ??= createTicketProcessor({
    orders: eventOrdersRepository,
    refundPaymentIntent: (paymentIntentId, idempotencyKey) => stripeBillingAdapter().refundPaymentIntent(paymentIntentId, idempotencyKey),
    email: {
      renderEmail,
      transport: createConfiguredEmailTransport(),
      emailFrom: emailEnv().emailFrom,
    },
    appUrl: appEnv().appUrl,
    now: () => new Date(),
    onEmailError(error, context) {
      // Never rethrow: the settlement is committed, and a 500 would make Stripe
      // redeliver a webhook that is already fully applied.
      console.error("ticket email failed", context, error);
    },
  });
  return builtTicketProcessor;
}

let ticketProcessor: TicketProcessor | undefined;

function productionTicketProcessor(): TicketProcessor {
  ticketProcessor ??= {
    process(actor, command) {
      return buildTicketProcessor().process(actor, command);
    },
  };
  return ticketProcessor;
}

export const POST = createWebhookPost({
  constructEvent(rawBody, signature) {
    return stripeClient().webhooks.constructEvent(rawBody, signature, billingEnv().stripeWebhookSecret);
  },
  processEvent(event) {
    return processStripeEvent(event, stripeWebhookActor, undefined, productionTicketProcessor());
  },
});
