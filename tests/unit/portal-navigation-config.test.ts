import {describe, expect, it} from "vitest";

import {portalNavigationGroups, type InternalNavGroupConfig} from "@/config/internal-navigation";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";

const groups: readonly InternalNavGroupConfig[] = portalNavigationGroups;

describe("portal navigation groups", () => {
  it("splits the member nav into me / company / benefits, in that order", () => {
    expect(groups.map((group) => group.id)).toEqual(["me", "company", "benefits"]);
    expect(groups.flatMap((group) => group.links.map((link) => link.id))).toEqual([
      "dashboard",
      "profile",
      "company",
      "showcase-listing",
      "seats",
      "events",
      "directory",
      "tools",
      "documents",
      "billing",
    ]);
  });

  it("gives Seats its own entry under the company group", () => {
    const company = groups.find((group) => group.id === "company");
    expect(company?.links.find((link) => link.id === "seats")?.href).toBe("/portal/company/seats");
  });

  it.each([
    ["en", en],
    ["zh-HK", zhHK],
  ])("has a non-empty %s label for every group", (_locale, bundle) => {
    for (const id of ["me", "company", "benefits"] as const) {
      expect(bundle.Portal.navGroups[id].length).toBeGreaterThan(0);
    }
  });
});
