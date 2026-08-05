import type Stripe from "stripe";

/**
 * Pinned explicitly so the payload shape this code parses is visible in the
 * repository rather than inherited from whatever the installed SDK defaults to.
 * The SDK types this as a literal, so bumping the `stripe` package forces a
 * compile error here and a deliberate review of the event shapes in
 * `lib/billing/webhook-service.ts`.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-06-24.dahlia";
