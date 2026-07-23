import {describe, expect, it} from "vitest";

import {AT_RISK_NO_LOGIN_DAYS, AT_RISK_RENEWAL_DAYS, AT_RISK_SCORE_MAX, classifyAtRisk, listAtRiskMembers, type AtRiskCandidate, type AtRiskReader} from "@/lib/admin/at-risk";

const staff = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;
const asOf = new Date("2026-07-19T00:00:00.000Z");
const day = 86_400_000;

function fixture(overrides: Partial<AtRiskCandidate> = {}): AtRiskCandidate {
  return {profileId: "risk-1", displayName: "Risk One", companyName: "Acme", planCode: "corporate", membershipId: "membership-risk-1", status: "active", score: 19, trend: -3, lastLoginAt: new Date(asOf.getTime() - day), renewalAt: new Date(asOf.getTime() + 30 * day), ...overrides};
}

describe("at-risk operations", () => {
  it("matches Branch A for a low score and declining trend without renewal or no-login evidence", () => {
    expect(classifyAtRisk(fixture({renewalAt: null}), asOf)).toMatchObject({atRisk: true, branchA: true, branchB: false});
  });

  it("matches Branch B at the exact 90-day login and 120-day renewal boundaries", () => {
    expect(classifyAtRisk(fixture({score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: new Date(asOf.getTime() - AT_RISK_NO_LOGIN_DAYS * day), renewalAt: new Date(asOf.getTime() + AT_RISK_RENEWAL_DAYS * day)}), asOf)).toMatchObject({atRisk: true, branchA: false, branchB: true});
  });

  it("counts missing login history as Branch B no-login evidence", () => {
    expect(classifyAtRisk(fixture({score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: null}), asOf)).toMatchObject({atRisk: true, branchA: false, branchB: true});
  });

  it("exposes both truthful branch reasons when both conditions match", () => {
    expect(classifyAtRisk(fixture({lastLoginAt: null}), asOf)).toMatchObject({atRisk: true, branchA: true, branchB: true});
  });

  it("excludes neither-branch and past-renewal members", () => {
    expect(classifyAtRisk(fixture({score: AT_RISK_SCORE_MAX, trend: 0}), asOf)).toMatchObject({atRisk: false, branchA: false, branchB: false});
    expect(classifyAtRisk(fixture({score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: null, renewalAt: new Date(asOf.getTime() - 1)}), asOf)).toMatchObject({atRisk: false, branchA: false, branchB: false});
  });

  it.each(["cancelled", "expired", "pending_review"] as const)("excludes %s memberships regardless of matching evidence", (status) => {
    expect(classifyAtRisk(fixture({status, lastLoginAt: null}), asOf)).toMatchObject({atRisk: false});
  });

  it("keeps deterministic renewal-first order and puts Branch A rows without renewal last", async () => {
    const candidates = [
      fixture({profileId: "null-z", renewalAt: null}), fixture({profileId: "future", score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: null, renewalAt: new Date(asOf.getTime() + day)}),
      fixture({profileId: "today", score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: null, renewalAt: new Date(asOf)}), fixture({profileId: "null-a", renewalAt: null}),
    ];
    const reader: AtRiskReader = {listCandidates: async () => candidates};
    const result = await listAtRiskMembers(staff, {asOf}, reader);
    expect(result.map((member) => member.profileId)).toEqual(["today", "future", "null-a", "null-z"]);
    expect(result[2]?.renewalAt).toBeNull();
    expect(result[2]?.evidence).toMatchObject({branchA: true, branchB: false, renewalWithinDays: 120, noLoginWithinDays: 90});
  });

  it("deduplicates multiple memberships after classification and retains the qualifying membership", async () => {
    const candidates = [fixture({profileId: "multi", score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: new Date(asOf.getTime() - day), renewalAt: new Date(asOf.getTime() + day)}), fixture({profileId: "multi", score: AT_RISK_SCORE_MAX, trend: 0, lastLoginAt: null, renewalAt: new Date(asOf.getTime() + 2 * day)})];
    const result = await listAtRiskMembers(staff, {asOf}, {listCandidates: async () => candidates});
    expect(result.map((member) => member.profileId)).toEqual(["multi"]);
    expect(result[0]?.renewalAt).toEqual(new Date(asOf.getTime() + 2 * day));
  });
  it("selects the same equal-renewal membership representation regardless of input order", async () => {
    const shared = {profileId: "same-day", renewalAt: new Date(asOf.getTime() + day), lastLoginAt: null, score: AT_RISK_SCORE_MAX, trend: 0};
    const first = fixture({...shared, membershipId: "membership-b", planCode: "startup", companyName: "Beta"});
    const second = fixture({...shared, membershipId: "membership-a", planCode: "corporate", companyName: "Alpha"});
    const reader = (candidates: readonly AtRiskCandidate[]): AtRiskReader => ({listCandidates: async () => candidates});
    const forward = await listAtRiskMembers(staff, {asOf}, reader([first, second]));
    const reversed = await listAtRiskMembers(staff, {asOf}, reader([second, first]));
    expect(forward.map(({membershipId, planCode, companyName}) => ({membershipId, planCode, companyName}))).toEqual([{membershipId: "membership-a", planCode: "corporate", companyName: "Alpha"}]);
    expect(reversed).toEqual(forward);
  });
  it("rejects non-staff actors before calling the reader", async () => {
    let called = false;
    const reader: AtRiskReader = {listCandidates: async () => { called = true; return []; }};
    await expect(listAtRiskMembers({kind: "member", userId: "auth-member", profileId: "member-1"}, {asOf}, reader)).rejects.toThrow("FORBIDDEN");
    expect(called).toBe(false);
  });
});