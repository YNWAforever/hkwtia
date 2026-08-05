import {describe, expect, it, vi} from "vitest";

import {createWebhookPost} from "@/lib/api/stripe-webhook-route";
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
});
