import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {
  cohortApplicationInputSchema,
  cohortStageSchema,
  parseCohortApplicationInput,
  parseCohortStage,
} from "@/lib/launchpad/contracts";
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

  it("uses the repository's public projection as the Launch Pad partner authority", () => {
    const source = readFileSync("app/[locale]/(public)/launchpad/page.tsx", "utf8");

    expect(source).toContain("landingPartnersRepository.listPublished({limit: 100})");
    expect(source).not.toContain("config/landing-partners");
    expect(typeof listPublishedLandingPartners).toBe("function");
  });
});
