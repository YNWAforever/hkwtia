import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  ip: "203.0.113.9",
  actor: null as unknown,
  actorThrows: false,
  result: {status: "redirect", url: "https://checkout.stripe.com/session"} as Record<string, unknown>,
  calls: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({"x-vercel-forwarded-for": state.ip}),
}));
vi.mock("@/lib/auth/actor", () => ({
  getActor: async () => {
    if (state.actorThrows) throw new Error("AUTH_UNAVAILABLE");
    return state.actor;
  },
}));
vi.mock("@/lib/tickets/checkout-core", () => ({
  createTicketCheckout: async (input: Record<string, unknown>) => {
    state.calls.push(input);
    return state.result;
  },
}));

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const KEY = "20000000-0000-4000-8000-000000000002";

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("eventId", EVENT_ID);
  data.set("idempotencyKey", KEY);
  data.set("buyerName", "Ada Lovelace");
  data.set("buyerEmail", "ADA@EXAMPLE.HK");
  data.set("locale", "en");
  data.set("seatName-0", "Ada Lovelace");
  data.set("seatEmail-0", "ada@example.hk");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

/** A fresh module instance per test: the limiter is deliberately process-local. */
async function loadAction() {
  vi.resetModules();
  return (await import("@/lib/tickets/checkout-actions")).submitTicketCheckoutAction;
}

describe("submitTicketCheckoutAction", () => {
  beforeEach(() => {
    state.ip = "203.0.113.9";
    state.actor = null;
    state.actorThrows = false;
    state.result = {status: "redirect", url: "https://checkout.stripe.com/session"};
    state.calls = [];
  });

  it("ignores a honeypot submission without reaching the checkout core", async () => {
    const action = await loadAction();

    await expect(action({status: "idle"}, form({website: "https://bot.invalid"}))).resolves.toEqual({status: "ignored"});
    expect(state.calls).toHaveLength(0);
  });

  it("rejects malformed input before reaching the checkout core", async () => {
    const action = await loadAction();

    await expect(action({status: "idle"}, form({buyerEmail: "not-an-email"}))).resolves.toEqual({status: "error", code: "INVALID"});
    await expect(action({status: "idle"}, form({eventId: "not-a-uuid"}))).resolves.toEqual({status: "error", code: "INVALID"});
    expect(state.calls).toHaveLength(0);
  });

  it("checks the buyer out as a guest when no member is signed in", async () => {
    const action = await loadAction();

    await expect(action({status: "idle"}, form())).resolves.toEqual({
      status: "redirect",
      url: "https://checkout.stripe.com/session",
    });
    expect(state.calls).toEqual([expect.objectContaining({
      eventId: EVENT_ID,
      buyer: {profileId: null, name: "Ada Lovelace", email: "ada@example.hk"},
      seats: [{name: "Ada Lovelace", email: "ada@example.hk"}],
      idempotencyKey: KEY,
      locale: "en",
    })]);
  });

  it("resolves the member from the actor rather than the submitted fields", async () => {
    state.actor = {kind: "member", userId: "user-1", profileId: "profile-1"};
    const action = await loadAction();

    await action({status: "idle"}, form());

    expect(state.calls).toEqual([expect.objectContaining({
      buyer: {profileId: "profile-1", name: "Ada Lovelace", email: "ada@example.hk"},
    })]);
  });

  // An identity-provider outage must not 500 the payment boundary: a visitor whose
  // session cannot be read buys as a guest, which is the same path an anonymous
  // visitor takes.
  it("buys as a guest when the session read throws rather than failing the action", async () => {
    state.actorThrows = true;
    const action = await loadAction();

    await expect(action({status: "idle"}, form())).resolves.toEqual({
      status: "redirect",
      url: "https://checkout.stripe.com/session",
    });
    expect(state.calls).toEqual([expect.objectContaining({
      buyer: {profileId: null, name: "Ada Lovelace", email: "ada@example.hk"},
    })]);
  });

  it("reports a refusal from the core by its code", async () => {
    state.result = {status: "error", code: "SOLD_OUT"};
    const action = await loadAction();

    await expect(action({status: "idle"}, form())).resolves.toEqual({status: "error", code: "SOLD_OUT"});
  });

  it("refuses the sixth attempt from one client address", async () => {
    const action = await loadAction();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(action({status: "idle"}, form())).resolves.toEqual({
        status: "redirect",
        url: "https://checkout.stripe.com/session",
      });
    }
    await expect(action({status: "idle"}, form())).resolves.toEqual({status: "error", code: "RATE_LIMITED"});
    expect(state.calls).toHaveLength(5);
  });
});
