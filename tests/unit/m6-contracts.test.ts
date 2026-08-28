import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {
  cohortApplicationInputSchema,
  cohortStageSchema,
  parseCohortApplicationInput,
  parseCohortStage,
} from "@/lib/launchpad/contracts";
import {landingPartners} from "@/config/landing-partners";
import {listPublishedLandingPartners} from "@/lib/db/repos/landing-partners";

describe("M6 Launch Pad contracts", () => {
  it("rejects an invalid cohort ID before an application reaches a repository", () => {
    expect(cohortApplicationInputSchema.safeParse({
      cohortId: "not-a-uuid",
      readiness: {targetMarket: "Singapore"},
    }).success).toBe(false);
  });

  it("parses a valid UUID and bounded readiness object", () => {
    const input = parseCohortApplicationInput({
      cohortId: "d2719aa8-84ee-4f1b-a81b-f44089d909f6",
      readiness: {
        targetMarket: "Singapore",
        marketEntryWindow: "six-months",
        hasLocalPartner: false,
      },
    });

    expect(input).toEqual({
      cohortId: "d2719aa8-84ee-4f1b-a81b-f44089d909f6",
      readiness: {
        targetMarket: "Singapore",
        marketEntryWindow: "six-months",
        hasLocalPartner: false,
      },
    });
  });

  it("accepts only the persisted cohort stages", () => {
    expect(cohortStageSchema.safeParse("graduated").success).toBe(true);
    expect(cohortStageSchema.safeParse("unknown").success).toBe(false);
    expect(parseCohortStage("accepted")).toBe("accepted");
  });

  it("ships only curated public fields in the static Landing Partner map", () => {
    expect(landingPartners.length).toBeGreaterThan(0);
    for (const partner of landingPartners) {
      expect(Object.keys(partner).sort()).toEqual([
        "id", "market", "organizationEn", "organizationZhHk", "region",
      ]);
      expect(JSON.stringify(partner)).not.toMatch(/prospect|in_discussion|contact|notes/i);
    }
  });
  it("keeps PR4 on the static source and pins the atomic PR5 cutover", () => {
    const source = readFileSync("app/[locale]/(public)/launchpad/page.tsx", "utf8");
    expect(source).toContain("landingPartners");
    expect(source).not.toContain("listPublishedLandingPartners");
    expect(typeof listPublishedLandingPartners).toBe("function");
  });
});
