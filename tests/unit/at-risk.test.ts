import {describe, expect, it} from "vitest";
import {AT_RISK_RENEWAL_DAYS, AT_RISK_SCORE_MAX, classifyAtRisk, listAtRiskMembers, type AtRiskCandidate, type AtRiskReader} from "@/lib/admin/at-risk";

const staff = {kind: "staff", userId: "auth-staff", profileId: "staff-1"} as const;
const asOf = new Date("2026-07-19T00:00:00+08:00");
function fixture(overrides: Partial<AtRiskCandidate> = {}): AtRiskCandidate {
  return {profileId: "risk-1", displayName: "Risk One", companyName: "Acme", planCode: "corporate", status: "active", score: 19, trend: -3, renewalAt: new Date(asOf.getTime() + 30 * 86_400_000), ...overrides};
}

describe("at-risk operations", () => {
  it("selects active or past-due low-score members renewing within 60 days", async () => {
    const candidates = [
      fixture({profileId: "risk-3", renewalAt: new Date(asOf.getTime() + 60 * 86_400_000)}),
      fixture({profileId: "risk-2", status: "past_due", renewalAt: new Date(asOf.getTime() + 30 * 86_400_000)}),
      fixture({profileId: "risk-1", renewalAt: new Date(asOf.getTime() + 30 * 86_400_000)}),
      fixture({profileId: "score-boundary", score: AT_RISK_SCORE_MAX}),
      fixture({profileId: "too-late", renewalAt: new Date(asOf.getTime() + (AT_RISK_RENEWAL_DAYS * 86_400_000) + 1)}),
      fixture({profileId: "already-renewed", renewalAt: new Date(asOf.getTime() - 1)}),
    ];
    const reader: AtRiskReader = {listCandidates: async () => candidates};
    const result = await listAtRiskMembers(staff, {asOf}, reader);
    expect(result.map((member) => member.profileId)).toEqual(["risk-1", "risk-2", "risk-3"]);
    expect(result[0]?.evidence).toEqual({scoreBelow: 20, renewalWithinDays: 60, status: "active"});
  });

  it.each(["cancelled", "expired", "pending_review"] as const)("excludes %s memberships", (status) => {
    expect(classifyAtRisk(fixture({status}), asOf)).toBe(false);
  });

  it("uses inclusive instant boundaries for today and exactly 60 days", () => {
    expect(classifyAtRisk(fixture({renewalAt: new Date(asOf)}), asOf)).toBe(true);
    expect(classifyAtRisk(fixture({renewalAt: new Date(asOf.getTime() + 60 * 86_400_000)}), asOf)).toBe(true);
  });

  it("rejects non-staff actors before calling the reader", async () => {
    let called = false;
    const reader: AtRiskReader = {listCandidates: async () => { called = true; return []; }};
    await expect(listAtRiskMembers({kind: "member", userId: "auth-member", profileId: "member-1"}, {asOf}, reader)).rejects.toThrow("FORBIDDEN");
    expect(called).toBe(false);
  });
});
