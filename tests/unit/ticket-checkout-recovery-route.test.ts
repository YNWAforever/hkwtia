import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

const state = vi.hoisted(() => ({actor: {kind: "member", userId: "user-1", profileId: "profile-1"} as unknown, read: vi.fn(), sessionStatus: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => state.actor}));
vi.mock("@/lib/db/repos/event-checkout-recoveries", () => ({eventCheckoutRecoveriesRepository: {read: state.read, invalidate: vi.fn()}}));
vi.mock("@/lib/billing/stripe", () => ({stripeBillingAdapter: () => ({ticketSessionStatus: state.sessionStatus})}));
import {GET} from "@/app/api/events/checkout-recovery/route";

const EVENT_ID = "10000000-0000-4000-8000-000000000001";
const KEY = "20000000-0000-4000-8000-000000000002";
const cookie = `hkwtia_ticket_checkout_recovery=v1.${EVENT_ID}.${KEY}.${"a".repeat(43)}`;
function request(withCookie = true): NextRequest {
  return new NextRequest(`http://localhost:3000/api/events/checkout-recovery?eventId=${EVENT_ID}`, {headers: withCookie ? {cookie} : {}});
}
const row = {orderId: "order-1", eventId: EVENT_ID, buyerProfileId: "profile-1", status: "pending", seatCount: 2, amountHkdCents: 50000,
  expiresAt: new Date("2030-01-01T00:00:00Z"), recoveryExpiresAt: new Date("2030-01-01T01:00:00Z"), stripeCheckoutSessionId: "cs_test_1", stripeCheckoutUrl: "https://checkout.stripe.com/c/pay/test"};

describe("checkout recovery GET", () => {
  beforeEach(() => {state.actor = {kind: "member", userId: "user-1", profileId: "profile-1"}; state.read.mockReset(); state.read.mockResolvedValue(row); state.sessionStatus.mockReset(); state.sessionStatus.mockResolvedValue("expired");});
  it("returns only the authorized summary with private no-store headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const body = await response.json();
    expect(body).toEqual({eventId: EVENT_ID, status: "pending", seatCount: 2, amountHkdCents: 50000, expiresAt: "2030-01-01T00:00:00.000Z"});
    expect(JSON.stringify(body)).not.toContain("stripe");
  });
  it("returns the same not-found body for missing cookie and wrong owner", async () => {
    const missing = await GET(request(false));
    state.actor = {kind: "member", userId: "user-2", profileId: "other"};
    const forbidden = await GET(request());
    expect(missing.status).toBe(404);
    expect(forbidden.status).toBe(404);
    expect(await missing.json()).toEqual(await forbidden.json());
    expect(forbidden.headers.get("Cache-Control")).toContain("no-store");
  });
  it.each([EVENT_ID, "30000000-0000-4000-8000-000000000003"])("clears only an authorized server-expired capability before buying event %s", async (nextEvent) => {
    state.read.mockResolvedValue({...row, status: "expired"});
    const response = await GET(new NextRequest(`http://localhost:3000/api/events/checkout-recovery?eventId=${nextEvent}`, {headers: {cookie}}));
    expect(response.status).toBe(404);
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")?.value).toBe("");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({status: "unavailable"});
  });
  it.each(["pending", "paid", "failed", "refunded", "refund_failed", "refund_pending"])("retains %s across events without exposing its summary or allowing a new uncertain attempt", async (status) => {
    state.read.mockResolvedValue({...row, status});
    const response = await GET(new NextRequest("http://localhost:3000/api/events/checkout-recovery?eventId=30000000-0000-4000-8000-000000000003", {headers: {cookie}}));
    expect(response.status).toBe(404);
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
    expect(await response.json()).toEqual({status: "unavailable"});
  });
  it("cannot clear another owner's expired capability", async () => {
    state.read.mockResolvedValue({...row, status: "expired"});
    state.actor = {kind: "member", userId: "user-2", profileId: "other"};
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
  });
  it("retains a capability and fails closed when its authoritative status cannot be read", async () => {
    state.read.mockRejectedValue(new Error("synthetic read fault"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it.each(["open", "complete"])("retains a locally expired capability when the provider reports %s", async (providerStatus) => {
    state.read.mockResolvedValue({...row, status: "expired"});
    state.sessionStatus.mockResolvedValue(providerStatus);
    const response = await GET(request());
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
  });
  it("does not turn an unattached expired order into proof that the provider never accepted it", async () => {
    state.read.mockResolvedValue({...row, status: "expired", stripeCheckoutSessionId: null, stripeCheckoutUrl: null});
    const response = await GET(request());
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
    expect(state.sessionStatus).not.toHaveBeenCalled();
  });
  it("fails closed without clearing the capability when the provider read fails", async () => {
    state.read.mockResolvedValue({...row, status: "expired"});
    state.sessionStatus.mockRejectedValue(new Error("synthetic provider read fault"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
  });
  it("revalidates the authorized record before clearing a capability during a settlement race", async () => {
    state.read.mockResolvedValueOnce({...row, status: "expired"}).mockResolvedValue({...row, status: "paid"});
    const response = await GET(request());
    expect(response.cookies.get("hkwtia_ticket_checkout_recovery")).toBeUndefined();
    expect(state.sessionStatus).not.toHaveBeenCalled();
  });

});
