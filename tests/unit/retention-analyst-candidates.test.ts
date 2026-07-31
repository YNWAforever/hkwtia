import {describe, expect, it} from "vitest";

import {
  projectRetentionCandidates,
  type RetentionCandidateSource,
} from "@/lib/ai/retention-analyst/candidates";

const asOf = new Date("2027-04-01T00:00:00.000Z");

function source(
  overrides: Partial<RetentionCandidateSource> & Pick<RetentionCandidateSource, "profileId" | "membershipId">,
): RetentionCandidateSource {
  return {
    locale: "en",
    planCode: "startup",
    status: "active",
    renewalAt: new Date("2027-10-01T00:00:00.000Z"),
    score: 50,
    trend: 1,
    lastLoginAt: new Date("2027-03-20T00:00:00.000Z"),
    ...overrides,
    profileId: overrides.profileId,
    membershipId: overrides.membershipId,
  };
}

describe("retention analyst candidates", () => {
  it("projects the two approved risk branches in deterministic profile order", () => {
    const candidates = projectRetentionCandidates([
      source({
        profileId: "profile-z",
        membershipId: "membership-z",
        locale: "en",
        renewalAt: new Date("2027-05-01T00:00:00.000Z"),
        lastLoginAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      source({
        profileId: "profile-a",
        membershipId: "membership-a",
        locale: "fr",
        score: 10,
        trend: -2,
      }),
      source({
        profileId: "profile-b",
        membershipId: "membership-b",
        locale: null,
        renewalAt: new Date("2027-04-20T00:00:00.000Z"),
        lastLoginAt: null,
        score: 5,
        trend: -1,
      }),
      source({
        profileId: "profile-safe",
        membershipId: "membership-safe",
      }),
    ], asOf);

    expect(candidates).toEqual([
      {
        profileId: "profile-a",
        membershipId: "membership-a",
        locale: "zh-HK",
        planCode: "startup",
        renewalDate: "2027-10-01",
        score: 10,
        trend: "down",
        riskCodes: ["low_score_declining"],
      },
      {
        profileId: "profile-b",
        membershipId: "membership-b",
        locale: "zh-HK",
        planCode: "startup",
        renewalDate: "2027-04-20",
        score: 5,
        trend: "down",
        riskCodes: ["low_score_declining", "inactive_before_renewal"],
      },
      {
        profileId: "profile-z",
        membershipId: "membership-z",
        locale: "en",
        planCode: "startup",
        renewalDate: "2027-05-01",
        score: 50,
        trend: "up",
        riskCodes: ["inactive_before_renewal"],
      },
    ]);
  });

  it("selects one deterministic membership per profile by renewal date then membership id", () => {
    const candidates = projectRetentionCandidates([
      source({
        profileId: "profile-duplicate",
        membershipId: "membership-later",
        renewalAt: new Date("2027-05-01T00:00:00.000Z"),
        score: 10,
        trend: -1,
      }),
      source({
        profileId: "profile-duplicate",
        membershipId: "membership-b",
        renewalAt: new Date("2027-04-20T00:00:00.000Z"),
        score: 10,
        trend: -1,
      }),
      source({
        profileId: "profile-duplicate",
        membershipId: "membership-a",
        renewalAt: new Date("2027-04-20T00:00:00.000Z"),
        score: 10,
        trend: -1,
      }),
    ], asOf);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      profileId: "profile-duplicate",
      membershipId: "membership-a",
      renewalDate: "2027-04-20",
    });
  });

  it("does not leak identity or contact fields from structurally wider source rows", () => {
    const privateSource = {
      ...source({
        profileId: "profile-private",
        membershipId: "membership-private",
        score: 10,
        trend: -1,
      }),
      displayName: "Private Name",
      email: "private@example.test",
      phone: "+85200000000",
    };

    const [candidate] = projectRetentionCandidates([privateSource], asOf);

    expect(Object.keys(candidate ?? {}).sort()).toEqual([
      "locale",
      "membershipId",
      "planCode",
      "profileId",
      "renewalDate",
      "riskCodes",
      "score",
      "trend",
    ]);
    expect(JSON.stringify(candidate)).not.toContain("Private Name");
    expect(JSON.stringify(candidate)).not.toContain("private@example.test");
    expect(JSON.stringify(candidate)).not.toContain("+85200000000");
  });
});
