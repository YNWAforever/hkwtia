import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const implementationFiles: readonly string[] = [
  "app/[locale]/(public)/page.tsx",
  "app/[locale]/(public)/about/page.tsx",
  "app/[locale]/(public)/about/chairman/page.tsx",
  "app/[locale]/(public)/about/committees/page.tsx",
  "app/[locale]/(public)/about/history/page.tsx",
  "app/[locale]/(public)/about/history/[slug]/page.tsx",
  "app/[locale]/(public)/programs/asa/page.tsx",
  "app/[locale]/(public)/programs/cpai/page.tsx",
  "app/[locale]/(public)/programs/hkict/page.tsx",
  "app/[locale]/(public)/programs/tct/page.tsx",
  "components/marketing/home-highlight-card.tsx",
  "components/marketing/institutional-page-intro.tsx",
  "components/marketing/media-gallery.tsx",
  "components/marketing/milestone-timeline.tsx",
  "components/marketing/program-credential.tsx",
  "components/marketing/program-editions.tsx",
  "components/marketing/story-section.tsx",
  "lib/db/repos/events.ts",
  "lib/db/repos/public-posts.ts",
  "lib/db/repos/showcase.ts",
  "lib/home/home-highlights.ts",
  "messages/en.json",
  "messages/zh-HK.json",
];

const pr3Documents = [
  "docs/superpowers/plans/2026-08-28-wisetech-pr3-institutional-pages.md",
  "docs/superpowers/specs/2026-08-28-wisetech-pr3-institutional-pages-design.md",
] as const;

const forbiddenRoots = [
  "drizzle/", "lib/auth/", "lib/payments/", "app/api/",
  "app/[locale]/(admin)/", "app/[locale]/(member)/", "scripts/seed-",
] as const;

const forbiddenText = [
  "YNWAforever/wisetech/", "partnerData", "visualData",
  "http://", "https://images.", "Stats",
] as const;

const authoritativeDonorUrl = "https://github.com/YNWAforever/wisetech";

type ScopeCandidate = Readonly<{path: string; source: string}>;

function scopeViolations(candidates: readonly ScopeCandidate[]): string[] {
  const errors: string[] = [];

  for (const candidate of candidates) {
    const path = candidate.path.replaceAll("\\", "/");
    for (const root of forbiddenRoots) {
      if (path.startsWith(root)) errors.push(`${path}: forbidden root ${root}`);
    }
    for (const text of forbiddenText) {
      if (candidate.source.includes(text)) errors.push(`${path}: forbidden text ${text}`);
    }
    if (candidate.source.includes(authoritativeDonorUrl)
      && !pr3Documents.includes(path as (typeof pr3Documents)[number])) {
      errors.push(`${path}: authoritative donor URL is documentation-only`);
    }
  }

  return errors;
}

function readCandidates(paths: readonly string[]): ScopeCandidate[] {
  return paths.map((path) => ({
    path,
    source: readFileSync(resolve(process.cwd(), path), "utf8"),
  }));
}

const requiredRouteAndComponentFiles = [
  "app/[locale]/(public)/page.tsx",
  "app/[locale]/(public)/about/page.tsx",
  "app/[locale]/(public)/about/chairman/page.tsx",
  "app/[locale]/(public)/about/committees/page.tsx",
  "app/[locale]/(public)/about/history/page.tsx",
  "app/[locale]/(public)/about/history/[slug]/page.tsx",
  "app/[locale]/(public)/programs/asa/page.tsx",
  "app/[locale]/(public)/programs/cpai/page.tsx",
  "app/[locale]/(public)/programs/hkict/page.tsx",
  "app/[locale]/(public)/programs/tct/page.tsx",
  "components/marketing/home-highlight-card.tsx",
  "components/marketing/institutional-page-intro.tsx",
  "components/marketing/story-section.tsx",
  "components/marketing/media-gallery.tsx",
] as const;

describe("WiseTech PR3 source boundary", () => {
  it("declares every expected PR3 route and component in an explicit allowlist", () => {
    // components/marketing/program-detail.tsx was removed from this allowlist: WP-4 Task 15
    // (docs/superpowers/plans/2026-09-04-wisetech-wp4-inner-pages.md) deleted the component it
    // named, superseding it with PageHero + RichCompass on the routes PR3 first introduced.
    expect(implementationFiles).toHaveLength(23);
    for (const path of requiredRouteAndComponentFiles) {
      expect(implementationFiles, path).toContain(path);
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(true);
    }
  });

  it("keeps global heroes, configuration, schema, migrations, and seeds outside implementation scope", () => {
    const forbiddenImplementationFiles = implementationFiles.filter((path) => (
      path === "components/marketing/page-hero.tsx"
      || path === "next.config.ts"
      || path.startsWith("drizzle/")
      || /(^|\/)schemas?(?:[-.]|$)/.test(path)
      || /(^|\/)seed(?:[-.]|$)/.test(path)
    ));

    expect(forbiddenImplementationFiles).toEqual([]);
  });

  it("scans the explicit implementation allowlist without relying on Git state", () => {
    expect(scopeViolations(readCandidates(implementationFiles))).toEqual([]);
  });

  it("permits the authoritative donor URL only in both PR3 planning documents", () => {
    const urlOwners = readCandidates([...implementationFiles, ...pr3Documents])
      .filter(({source}) => source.includes(authoritativeDonorUrl))
      .map(({path}) => path);

    expect(urlOwners).toEqual([...pr3Documents]);
  });

  it("detects every forbidden root and forbidden text", () => {
    for (const root of forbiddenRoots) {
      expect(
        scopeViolations([{path: `${root}candidate.ts`, source: "export {};"}]),
        root,
      ).not.toEqual([]);
    }
    for (const text of forbiddenText) {
      expect(
        scopeViolations([{path: "components/marketing/candidate.tsx", source: text}]),
        text,
      ).not.toEqual([]);
    }
  });

  it("rejects a donor runtime import and accepts local PR3 imports", () => {
    const hostile = [{
      path: "components/marketing/candidate.tsx",
      source: 'import donor from "YNWAforever/wisetech/runtime";',
    }];
    const safe = [{
      path: "components/marketing/candidate.tsx",
      source: 'import {StorySection} from "@/components/marketing/story-section";',
    }];

    expect(scopeViolations(hostile)).not.toEqual([]);
    expect(scopeViolations(safe)).toEqual([]);
  });
});
