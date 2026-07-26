import {describe, expect, it} from "vitest";

import {JOURNEYS} from "@/config/journeys";
import {scheduleJourney} from "@/lib/automation/schedule";

describe("scheduleJourney", () => {
  it.each([
    ["onboarding_90d", "welcome", 0],
    ["onboarding_90d", "day90_review", 90],
    ["renewal", "renewal_90", -90],
    ["dunning", "dunning_3", 3],
    ["winback", "winback_60", 60],
  ] as const)("%s/%s schedules at the exact HKT-relative day", (journey, step, days) => {
    const rows = scheduleJourney({
      journey,
      profileId: "profile-1",
      membershipId: "00000000-0000-0000-0000-000000000001",
      instanceKey: "period:2027-01-01",
      anchor: new Date("2027-01-01T00:00:00+08:00"),
    });

    expect(rows.find((row) => row.step === step)?.scheduledAt.toISOString())
      .toBe(new Date(Date.parse("2027-01-01T00:00:00+08:00") + days * 86_400_000).toISOString());
  });

  it("preserves the anchor instant and produces the stable delivery key", () => {
    const anchor = new Date("2027-03-15T09:30:00+08:00");
    const [welcome] = scheduleJourney({
      journey: "onboarding_90d",
      profileId: "profile-1",
      membershipId: "membership-1",
      instanceKey: "joined:2027-03-15",
      anchor,
    });

    expect(anchor.toISOString()).toBe("2027-03-15T01:30:00.000Z");
    expect(welcome.scheduledAt.toISOString()).toBe("2027-03-15T01:30:00.000Z");
    expect(welcome.deliveryKey).toBe("journey:profile-1:onboarding_90d:joined:2027-03-15:welcome");
  });

  it("keeps the approved catalogue mappings and channels", () => {
    expect(JOURNEYS.renewal.find((step) => step.key === "renewal_14")).toMatchObject({
      template: "renewal_14",
      classification: "transactional",
      channels: ["email", "whatsapp"],
    });
    expect(JOURNEYS.dunning.find((step) => step.key === "dunning_3")).toMatchObject({
      template: "dunning_3",
      classification: "transactional",
      channels: ["email", "whatsapp"],
    });
  });
});
