import {describe, expect, it} from "vitest";

import legacyUrls from "@/content/legacy-urls.json";
import {milestones} from "@/content/milestones";
import {publicRoutes} from "@/config/public-routes";
import {milestonesOnly} from "@/lib/history/milestones";

const allowed = new Set<string>(publicRoutes);

// Milestone detail pages (/about/history/<slug>) are typed content, not a static
// route, so they can never appear in `publicRoutes` -- but their slugs are still
// known at build time. Every milestone-kind record has a page now; `featured`
// chooses the homepage highlights, it does not decide whether the page exists.
// The guarantee this test exists to provide -- no redirect pointing at a page
// that does not exist -- checks the milestone record as a second allowlist.
const milestoneDetailPaths = new Set(
  milestonesOnly(milestones).map(({slug}) => `/about/history/${slug}`),
);

// Task 1's capture recorded 577 urls, 0 missed. `.legacy-capture/inventory.json`
// is git-ignored bulk input (see .gitignore) and will not exist in every clone
// or CI checkout, so the count is pinned here rather than read from that file
// at test time.
const CAPTURED_URL_COUNT = 577;

describe("legacy url map", () => {
  it("declares a destination for every entry", () => {
    for (const entry of legacyUrls.entries) {
      expect(entry.from, JSON.stringify(entry)).toMatch(/^\//);
      expect(entry.to, entry.from).toMatch(/^\//);
      expect(["equivalent", "section-fallback", "gone"]).toContain(entry.kind);
    }
  });

  // A redirect to a route that does not exist trades a 404 for a slower 404.
  it("never points at a route outside the public allowlist", () => {
    for (const entry of legacyUrls.entries) {
      expect(
        allowed.has(entry.to) || milestoneDetailPaths.has(entry.to),
        `${entry.from} -> ${entry.to}`,
      ).toBe(true);
    }
  });

  // The allowlist test above only asks whether a destination exists, so flipping a
  // milestone to `featured` used to leave its legacy WordPress URL still falling back
  // to the timeline: the detail page was built and sitemapped, but every inbound link
  // from 25 years of the old site landed one level up from it, silently. A featured
  // record that has a captured permalink must point at its detail page.
  // Un-featuring must not retarget a URL that already resolves there: the page still
  // exists. Records added after the archive have `legacyPath: null` and no redirect
  // to invent. Scoped to kind `milestone`: member stories redirect to /showcase and
  // press releases to /news, which is their own mapping and not this rule.
  it("points every featured milestone that has a WordPress url at its detail page", () => {
    const byFrom = new Map(legacyUrls.entries.map((entry) => [entry.from, entry]));

    for (const milestone of milestonesOnly(milestones)) {
      if (milestone.legacyPath == null) continue;
      const entry = byFrom.get(milestone.legacyPath);
      expect(entry, `${milestone.slug} has no legacy-urls entry`).toBeDefined();
      const detail = {to: `/about/history/${milestone.slug}`, kind: "equivalent" as const};
      const timeline = {to: "/about/history", kind: "section-fallback" as const};
      if (milestone.featured) {
        expect({to: entry!.to, kind: entry!.kind}, milestone.slug).toEqual(detail);
      } else {
        expect([detail, timeline], milestone.slug).toContainEqual({to: entry!.to, kind: entry!.kind});
      }
    }
  });

  it("has no duplicate sources", () => {
    const sources = legacyUrls.entries.map(({from}) => from);
    expect(new Set(sources).size).toBe(sources.length);
  });

  // "/" -> "/" would be an infinite redirect and take the site down. The home
  // page is excluded from the fixture entirely rather than mapped to itself.
  it("never redirects a path to itself", () => {
    for (const entry of legacyUrls.entries) {
      expect(entry.from).not.toBe(entry.to);
    }
    expect(legacyUrls.entries.some(({from}) => from === "/")).toBe(false);
  });

  // Pins the fixture to the capture it was built from: every captured url
  // classified, minus the one excluded home page.
  it("covers every captured url except the excluded home page", () => {
    expect(legacyUrls.entries.length).toBe(CAPTURED_URL_COUNT - 1);
  });
});
