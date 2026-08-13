import {describe, expect, it} from "vitest";

import {milestones} from "@/content/milestones";
import {featuredOnly, findBySlug, milestonesOnly} from "@/lib/history/milestones";
import {generateStaticParams} from "@/app/[locale]/(public)/about/history/[slug]/page";

describe("history detail pages", () => {
  it("generates a param for every featured milestone and no others", () => {
    const expected = featuredOnly(milestonesOnly(milestones)).map(({slug}) => slug).sort();

    expect(generateStaticParams().map(({slug}) => slug).sort()).toEqual(expected);
  });

  it("every generated slug resolves to a milestone", () => {
    for (const {slug} of generateStaticParams()) {
      expect(findBySlug(milestones, slug), slug).not.toBeNull();
    }
  });

  // A member story is long enough to look featured, but it belongs on
  // /showcase. It must not acquire a history page by being wordy.
  it("generates no param for a member story or press release", () => {
    const generated = new Set(generateStaticParams().map(({slug}) => slug));
    const excluded = milestones.filter(({kind}) => kind !== "milestone");

    expect(excluded.length).toBeGreaterThan(0);
    for (const entry of excluded) {
      expect(generated.has(entry.slug), entry.slug).toBe(false);
    }
  });

  // Pins the count so a future content edit that accidentally flips
  // `featured` somewhere shows up as a failing test, not a silent fourth
  // history page.
  it("generates exactly 3 params", () => {
    expect(generateStaticParams()).toHaveLength(3);
  });
});
