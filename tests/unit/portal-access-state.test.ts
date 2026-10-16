import {describe, expect, it} from "vitest";

import type {MembershipStatus} from "@/lib/membership/constants";
import {getDocuments, getMemberEvents, searchDirectory, type PortalContentDependencies} from "@/lib/portal/content";

const actor = {kind: "member", userId: "auth-id", profileId: "profile-id"} as const;

function dependencies(status: MembershipStatus) {
  const calls = {directory: 0, events: 0, resources: 0, receipts: 0};
  const deps: PortalContentDependencies = {
    memberships: {list: async () => [{id: "membership", status, planCode: "startup", ownerUserId: "profile-id", companyId: null, billingInterval: "annual", seatLimit: 5}]},
    directory: {page: async () => { calls.directory++; return {items: [], nextCursor: null}; }},
    events: {page: async () => { calls.events++; return {items: [], nextCursor: null}; }},
    documents: {
      listApproved: async () => { calls.resources++; return []; },
      listReceipts: async () => { calls.receipts++; return []; },
    },
  };
  return {deps, calls};
}

describe("portal access states preserve the existing entitlement boundary", () => {
  it.each([
    ["pending_payment", "needs_payment"], ["pending_review", "under_review"],
    ["expired", "inactive"], ["cancelled", "inactive"],
  ] as const)("returns a recoverable %s state without invoking a private adapter", async (status, expected) => {
    const {deps, calls} = dependencies(status);
    for (const operation of [() => searchDirectory(actor, "", null, deps), () => getMemberEvents(actor, deps), () => getDocuments(actor, deps)]) {
      await expect(operation()).rejects.toMatchObject({message: "MEMBERSHIP_INACTIVE", access: {status: expected}});
    }
    expect(calls).toEqual({directory: 0, events: 0, resources: 0, receipts: 0});
  });

  it.each(["active", "past_due", "cancel_at_period_end"] as const)("preserves benefits for %s", async (status) => {
    const {deps, calls} = dependencies(status);
    await expect(searchDirectory(actor, "", null, deps)).resolves.toEqual({items: [], nextCursor: null});
    await expect(getMemberEvents(actor, deps)).resolves.toEqual([]);
    await expect(getDocuments(actor, deps)).resolves.toEqual([]);
    expect(calls).toEqual({directory: 1, events: 1, resources: 1, receipts: 1});
  });

  it("does not turn a failed membership read into an inactive state", async () => {
    const {deps, calls} = dependencies("active");
    const unavailable = {...deps, memberships: {list: async () => { throw new Error("DATABASE_UNAVAILABLE"); }}};
    await expect(searchDirectory(actor, "", null, unavailable)).rejects.toThrow("DATABASE_UNAVAILABLE");
    expect(calls).toEqual({directory: 0, events: 0, resources: 0, receipts: 0});
  });
});
