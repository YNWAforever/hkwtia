import {describe, expect, it} from "vitest";

import type {MilestoneRecord} from "@/content/schemas";
import {byYearDescending, featuredOnly, findBySlug, historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";

function milestone(overrides: Partial<MilestoneRecord>): MilestoneRecord {
  return {
    slug: "x", year: 2010, month: "01", kind: "milestone",
    titleEn: "t", titleZh: "t", bodyEn: "b", bodyZh: "b",
    images: [], legacyPath: "/2010/01/x/", featured: false,
    ...overrides,
  } as MilestoneRecord;
}

describe("milestone derivations", () => {
  it("groups by year, newest first, and omits years with no entries", () => {
    const groups = byYearDescending([
      milestone({slug: "a", year: 2003}),
      milestone({slug: "b", year: 2016}),
      milestone({slug: "c", year: 2003}),
    ]);

    // 2004-2015 have no entries and must not appear as empty rows.
    expect(groups.map(({year}) => year)).toEqual([2016, 2003]);
    expect(groups[1]?.milestones.map(({slug}) => slug)).toEqual(["a", "c"]);
  });

  it("returns only featured entries", () => {
    const list = [milestone({slug: "a", featured: true}), milestone({slug: "b"})];
    expect(featuredOnly(list).map(({slug}) => slug)).toEqual(["a"]);
  });

  it("finds by slug and returns null for an unknown one", () => {
    const list = [milestone({slug: "a"})];
    expect(findBySlug(list, "a")?.slug).toBe("a");
    expect(findBySlug(list, "nope")).toBeNull();
  });

  it("keeps only kind: milestone, excluding member stories and press releases", () => {
    const list = [
      milestone({slug: "a", kind: "milestone"}),
      milestone({slug: "b", kind: "member-story"}),
      milestone({slug: "c", kind: "press-release"}),
      milestone({slug: "d", kind: "milestone"}),
    ];
    expect(milestonesOnly(list).map(({slug}) => slug)).toEqual(["a", "d"]);
  });

  it("derives founding year, milestone count and latest year from real content only", () => {
    const list = [
      milestone({slug: "a", year: 2001, kind: "milestone"}),
      milestone({slug: "b", year: 2013, kind: "milestone"}),
      milestone({slug: "c", year: 2025, kind: "milestone"}),
      milestone({slug: "d", year: 2026, kind: "member-story"}),
    ];
    expect(historyCompassFacts(list)).toEqual({foundingYear: 2001, milestoneCount: 3, latestYear: 2025});
  });
});
