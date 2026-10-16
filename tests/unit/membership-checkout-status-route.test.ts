import {beforeEach, describe, expect, it, vi} from "vitest";
import {NextRequest} from "next/server";

const state = vi.hoisted(() => ({actor: {kind: "member", userId: "owner-a", profileId: "owner-a"} as object | null, denied: false, calls: [] as unknown[][]}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => state.actor}));
vi.mock("@/lib/billing/member-checkout-status", () => ({readMembershipCheckoutStatus: async (...args: unknown[]) => {
  state.calls.push(args);
  if (state.denied) throw new Error("FORBIDDEN");
  return "processing";
}}));

import {GET} from "@/app/api/membership/checkout-status/route";
const id = "20000000-0000-4000-8000-000000000002";
function request(value = id) {return new NextRequest(`https://app.example.test/api/membership/checkout-status?membershipId=${value}&session_id=forged-success`);}

beforeEach(() => {state.actor = {kind: "member", userId: "owner-a", profileId: "owner-a"}; state.denied = false; state.calls = [];});

describe("membership checkout status route", () => {
  it("returns a private persisted projection, ignoring Stripe success query text", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({status: "processing"});
    expect(state.calls).toEqual([[state.actor, id]]);
  });
  it("conceals missing or unauthorized memberships", async () => {
    state.denied = true;
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("does not query membership state without an actor or a valid ID", async () => {
    state.actor = null;
    expect((await GET(request())).status).toBe(404);
    state.actor = {kind: "member"};
    expect((await GET(request("bad"))).status).toBe(404);
    expect(state.calls).toHaveLength(0);
  });
});
