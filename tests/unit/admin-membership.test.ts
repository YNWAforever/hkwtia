import {describe, expect, it, vi} from "vitest";

import {compMembership, type CompMembershipDependencies} from "@/lib/db/repos/admin-membership";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";

const admin = {kind: "staff", userId: "u-staff", profileId: "p-staff"} as const;

function dependencies(overrides: Partial<{seatAllowance: number | null}> = {}) {
  const calls = {inserted: [] as unknown[], audited: [] as unknown[], order: [] as string[]};
  const deps: CompMembershipDependencies = {
    transaction: (work) => work({
      planSeatAllowance: async () => overrides.seatAllowance === undefined ? 5 : overrides.seatAllowance,
      insertMembership: async (input) => {
        calls.order.push("insert");
        calls.inserted.push(input);
        return {id: "m-1", ...input} as never;
      },
      insertAudit: async (input) => { calls.order.push("audit"); calls.audited.push(input); },
    }),
  };
  return {deps, calls};
}

describe("compMembership", () => {
  it.each([
    ["member", {kind: "member", userId: "u", profileId: "p"}],
    ["anonymous", ANONYMOUS_ACTOR],
    ["system", {kind: "system", userId: null, source: "stripe-webhook"}],
  ] as const)("refuses a %s actor before touching the database", async (_name, forged) => {
    const loadDatabase = vi.fn();
    await expect(compMembership(forged as never, {profileId: "p-1", planCode: "community"}, {
      transaction: loadDatabase as never,
    })).rejects.toThrow("FORBIDDEN");
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("writes the membership active, seated from the plan, and audits it in the same transaction", async () => {
    const {deps, calls} = dependencies({seatAllowance: 12});

    await compMembership(admin, {profileId: "p-1", planCode: "corporate"}, deps);

    expect(calls.inserted).toEqual([{
      ownerUserId: "p-1",
      companyId: null,
      planCode: "corporate",
      status: "active",
      seatLimit: 12,
    }]);
    expect(calls.audited).toEqual([{
      actorUserId: "p-staff",
      actorType: "staff",
      action: "membership.comped",
      targetType: "membership",
      targetId: "m-1",
      metadata: {planCode: "corporate", ownerUserId: "p-1"},
    }]);
    // Audit must follow the insert inside the same transaction, never beside it.
    expect(calls.order).toEqual(["insert", "audit"]);
  });

  it.each([
    ["an unknown plan", {profileId: "p-1", planCode: "platinum"}],
    ["a blank profile", {profileId: "", planCode: "community"}],
    ["a hand-set status", {profileId: "p-1", planCode: "community", status: "past_due"}],
    ["a company target", {profileId: "p-1", planCode: "community", companyId: "c-1"}],
  ])("rejects %s", async (_name, input) => {
    const {deps} = dependencies();
    await expect(compMembership(admin, input, deps)).rejects.toThrow();
  });

  it("refuses when the plan has no seat allowance rather than inventing one", async () => {
    const {deps, calls} = dependencies({seatAllowance: null});
    await expect(compMembership(admin, {profileId: "p-1", planCode: "community"}, deps))
      .rejects.toThrow("MEMBERSHIP_PLAN_NOT_FOUND");
    expect(calls.inserted).toEqual([]);
  });
});
