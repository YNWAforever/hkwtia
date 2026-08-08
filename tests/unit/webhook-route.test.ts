import {describe, expect, it, vi} from "vitest";

import {createWebhookPost} from "@/lib/api/stripe-webhook-route";
import {STRIPE_API_VERSION} from "@/lib/billing/stripe-api-version";
import {checkoutCompleted} from "@/tests/fixtures/stripe-events";

describe("Stripe webhook route", () => {
  it("passes the exact raw body to signature verification and rejects an invalid signature without processing", async () => {
    const raw = "{\n  \"id\": \"evt_signed\"\n}";
    const constructEvent = vi.fn(() => { throw new Error("bad signature"); });
    const processEvent = vi.fn();
    const post = createWebhookPost({constructEvent, processEvent});

    const response = await post(new Request("http://localhost/api/stripe/webhook", {
      method: "POST", body: raw, headers: {"stripe-signature": "invalid"},
    }));

    expect(response.status).toBe(400);
    expect(constructEvent).toHaveBeenCalledWith(raw, "invalid");
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("returns 200 only after a processed or duplicate verified event", async () => {
    const stripeEvent = checkoutCompleted();
    let finished = false;
    const post = createWebhookPost({
      constructEvent: () => stripeEvent,
      processEvent: async () => { finished = true; return "duplicate"; },
    });
    const response = await post(new Request("http://localhost/api/stripe/webhook", {
      method: "POST", body: "raw", headers: {"stripe-signature": "valid"},
    }));
    expect(finished).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({received: true, result: "duplicate"});
  });

  it("returns a retryable 500 for transient processing failures", async () => {
    const post = createWebhookPost({
      constructEvent: () => checkoutCompleted(),
      processEvent: async () => { throw new Error("database unavailable"); },
    });
    const response = await post(new Request("http://localhost/api/stripe/webhook", {
      method: "POST", body: "raw", headers: {"stripe-signature": "valid"},
    }));
    expect(response.status).toBe(500);
  });

  it("loads only the billing contract for the production webhook handler", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_STARTUP_PRICE_ID", "price_startup");
    vi.stubEnv("STRIPE_CORPORATE_PRICE_ID", "price_corporate");

    const constructEvent = vi.fn(() => checkoutCompleted());
    const processStripeEvent = vi.fn(async () => "processed" as const);
    const Stripe = vi.fn(() => ({
      webhooks: {constructEvent},
    }));

    vi.doMock("stripe", () => ({default: Stripe}));
    vi.doMock("@/lib/billing/webhook-service", () => ({
      WebhookInputError: class WebhookInputError extends Error {
        readonly code = "INVALID_WEBHOOK_EVENT";
        constructor() {
          super("INVALID_WEBHOOK_EVENT");
          this.name = "WebhookInputError";
        }
      },
      processStripeEvent,
    }));

    const route = await import("@/app/api/stripe/webhook/route");
    const response = await route.POST(new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "raw",
      headers: {"stripe-signature": "valid"},
    }));

    expect(response.status).toBe(200);
    expect(Stripe).toHaveBeenCalledWith("sk_test_example", {apiVersion: STRIPE_API_VERSION});
    expect(constructEvent).toHaveBeenCalledWith("raw", "valid", "whsec_example");
    expect(processStripeEvent).toHaveBeenCalledOnce();
  });
});
