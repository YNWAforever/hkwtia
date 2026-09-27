import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

const state = vi.hoisted(() => ({actor: {kind: "member", userId: "user-1", profileId: "profile-1"} as unknown, read: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => state.actor}));
vi.mock("@/lib/db/repos/event-checkout-recoveries", () => ({eventCheckoutRecoveriesRepository: {read: state.read, invalidate: vi.fn()}}));
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
  beforeEach(() => {state.actor = {kind: "member", userId: "user-1", profileId: "profile-1"}; state.read.mockReset(); state.read.mockResolvedValue(row);});
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
});
