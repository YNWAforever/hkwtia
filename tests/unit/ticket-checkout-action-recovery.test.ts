import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  redirect: vi.fn(),
  issue: vi.fn(),
  read: vi.fn(),
  core: vi.fn(),
  providerStatus: vi.fn(),
  expireBySession: vi.fn(),
  invalidate: vi.fn(),
  actor: {kind: "member", userId: "user-1", profileId: "profile-1"} as unknown,
}));
vi.mock("next/navigation", () => ({redirect: (url: string) => {state.redirect(url); throw new Error("NEXT_REDIRECT");}}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({"x-vercel-forwarded-for": "203.0.113.21"}),
  cookies: async () => ({
    get: () => state.cookie ? {value: state.cookie} : undefined,
    set: state.cookieSet,
    delete: state.cookieDelete,
  }),
}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => state.actor}));
vi.mock("@/lib/tickets/checkout-core", () => ({createTicketCheckout: state.core}));
vi.mock("@/lib/db/repos/event-checkout-recoveries", () => ({eventCheckoutRecoveriesRepository: {issueForAttempt: state.issue, read: state.read, invalidate: state.invalidate}}));
vi.mock("@/lib/security/shared-rate-limit", () => ({createSharedRateLimiter: () => ({check: async () => ({allowed: true, retryAfterSeconds: 0})})}));
vi.mock("@/lib/billing/stripe", () => ({stripeBillingAdapter: () => ({ticketSessionStatus: state.providerStatus})}));
vi.mock("@/lib/db/repos/event-orders", () => ({eventOrdersRepository: {expireBySession: state.expireBySession, expireUnattachedOrder: vi.fn()}}));

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const KEY = "20000000-0000-4000-8000-000000000002";
function form(): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries({eventId: EVENT_ID, idempotencyKey: KEY, buyerName: "Ada", buyerEmail: "ada@example.test", locale: "en", quantity: "1", "seatName-0": "Ada", "seatEmail-0": "ada@example.test"})) data.set(name, value);
  return data;
}
async function action() {
  vi.resetModules();
  return (await import("@/lib/tickets/checkout-actions")).submitTicketCheckoutAction;
}

describe("ticket checkout action recovery capability", () => {
  beforeEach(() => {
    state.cookie = undefined;
    state.cookieSet.mockReset(); state.cookieDelete.mockReset(); state.redirect.mockReset(); state.issue.mockReset(); state.read.mockReset(); state.core.mockReset();
    state.providerStatus.mockReset(); state.providerStatus.mockResolvedValue("open");
    state.expireBySession.mockReset(); state.expireBySession.mockResolvedValue(true); state.invalidate.mockReset();
    state.issue.mockResolvedValue(true);
    state.read.mockResolvedValue(null);
    state.core.mockResolvedValue({status: "redirect", url: "https://checkout.stripe.com/c/pay/test"});
    state.actor = {kind: "member", userId: "user-1", profileId: "profile-1"};
  });
  it("sets an HttpOnly capability and persists only its digest for the accepted attempt", async () => {
    await expect((await action())({status: "idle"}, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/test");
    expect(state.cookieSet).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({httpOnly: true, sameSite: "lax"}));
    const raw = state.cookieSet.mock.calls[0][1] as string;
    expect(state.issue).toHaveBeenCalledWith(expect.objectContaining({eventId: EVENT_ID, idempotencyKey: KEY, buyerProfileId: "profile-1", digest: expect.stringMatching(/^[a-f0-9]{64}$/)}));
    expect(JSON.stringify(state.issue.mock.calls)).not.toContain(raw);
  });
  it("redirects from the action only after persisting the capability", async () => {
    await expect((await action())({status: "idle"}, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(state.issue).toHaveBeenCalledOnce();
    expect(state.redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/test");
    expect(state.issue.mock.invocationCallOrder[0]).toBeLessThan(state.redirect.mock.invocationCallOrder[0]);
  });
  it("shows an existing pending attempt without creating a second payable session", async () => {
    state.cookie = `v1.${EVENT_ID}.${KEY}.${"a".repeat(43)}`;
    state.read.mockResolvedValue({eventId: EVENT_ID, buyerProfileId: "profile-1", status: "pending", seatCount: 1, amountHkdCents: 25000, expiresAt: new Date("2030-01-01T00:00:00Z"), recoveryExpiresAt: new Date("2030-01-01T01:00:00Z")});
    const result = await (await action())({status: "idle"}, form());
    expect(result).toEqual(expect.objectContaining({status: "pending"}));
    expect(state.core).not.toHaveBeenCalled();
  });
  it("denies a cookie belonging to another member without creating checkout", async () => {
    state.cookie = `v1.${EVENT_ID}.${KEY}.${"a".repeat(43)}`;
    state.read.mockResolvedValue({eventId: EVENT_ID, buyerProfileId: "another-profile", status: "pending", recoveryExpiresAt: new Date("2030-01-01T01:00:00Z")});
    const result = await (await action())({status: "idle"}, form());
    expect(result).toEqual({status: "error", code: "UNAVAILABLE"});
    expect(state.core).not.toHaveBeenCalled();
  });
  it("resumes only the original provider session and clears a provider-expired attempt", async () => {
    state.cookie = `v1.${EVENT_ID}.${KEY}.${"a".repeat(43)}`;
    state.read.mockResolvedValue({eventId: EVENT_ID, buyerProfileId: "profile-1", status: "pending", seatCount: 1, amountHkdCents: 25000,
      expiresAt: new Date("2030-01-01T00:00:00Z"), recoveryExpiresAt: new Date("2030-01-01T01:00:00Z"),
      stripeCheckoutSessionId: "cs_test_1", stripeCheckoutUrl: "https://checkout.stripe.com/c/pay/test"});
    const {resumeTicketCheckoutAction} = await import("@/lib/tickets/checkout-actions");
    expect(await resumeTicketCheckoutAction({status: "idle"}, form())).toEqual({status: "redirect", url: "https://checkout.stripe.com/c/pay/test"});
    expect(state.core).not.toHaveBeenCalled();
    state.providerStatus.mockResolvedValue("expired");
    expect(await resumeTicketCheckoutAction({status: "idle"}, form())).toEqual({status: "error", code: "RETRY_EXPIRED"});
    expect(state.expireBySession).toHaveBeenCalledWith("cs_test_1");
    expect(state.cookieDelete).toHaveBeenCalled();
  });

  it("does not send a buyer to an open Stripe URL when capability persistence fails", async () => {
    state.issue.mockRejectedValue(new Error("database unavailable"));
    expect(await (await action())({status: "idle"}, form())).toEqual({status: "error", code: "UNAVAILABLE"});
    expect(state.cookieSet).toHaveBeenCalled();
  });
});
