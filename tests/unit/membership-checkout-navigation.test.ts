import {describe, expect, it, vi} from "vitest";

import {readMembershipCheckoutStatus} from "@/lib/billing/member-checkout-status";
import type {Actor, MembershipRecord} from "@/lib/membership/lifecycle";

const membershipId = "20000000-0000-4000-8000-000000000002";
const owner: Actor = {kind: "member", userId: "owner-a", profileId: "owner-a"};

function reader(status: MembershipRecord["status"], permitted = true) {
  const getBillingAccess = vi.fn(async (actor: Actor, id: string) => {
    expect(actor).toEqual(owner);
    expect(id).toBe(membershipId);
    return permitted ? {id, status, applicationId: "application-a", planCode: "startup"} as MembershipRecord : null;
  });
  return {getBillingAccess};
}

describe("membership checkout status", () => {
  it.each([
    ["pending_payment", "processing"],
    ["pending_review", "review"],
    ["active", "active"],
    ["cancelled", "failed"],
    ["expired", "failed"],
    ["past_due", "failed"],
  ] as const)("maps the persisted %s membership without trusting a success query", async (status, expected) => {
    const store = reader(status);
    await expect(readMembershipCheckoutStatus(owner, membershipId, store)).resolves.toBe(expected);
    expect(store.getBillingAccess).toHaveBeenCalledOnce();
  });

  it("denies an actor without billing access", async () => {
    await expect(readMembershipCheckoutStatus(owner, membershipId, reader("active", false))).rejects.toThrow("FORBIDDEN");
  });
});
