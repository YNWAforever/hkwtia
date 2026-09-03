import {describe, expect, it} from "vitest";

import {publicRoutes} from "@/config/public-routes";
import en from "@/messages/en.json";
import {
  pageCopyBundleValues,
  pageCopyCatalog,
  pageCopyCatalogSizes,
  pageCopyEnglishRejection,
} from "@/lib/i18n/page-copy-catalog";
import {
  isPageCopyNamespace,
  pageCopyNamespaces,
  pageCopyRoutes,
} from "@/lib/i18n/page-copy-scope";

describe("page copy scope", () => {
  it("maps every editable namespace to at least one declared public route", () => {
    for (const namespace of pageCopyNamespaces) {
      const routes = pageCopyRoutes[namespace];
      expect(routes.length, `${namespace} has no public route`).toBeGreaterThan(0);
      for (const route of routes) {
        // A route that is not in publicRoutes would silently stop invalidation.
        expect(publicRoutes, `${namespace} -> ${route}`).toContain(route);
      }
    }
    expect(Object.keys(pageCopyRoutes).sort()).toEqual([...pageCopyNamespaces].sort());
  });

  it("keeps product UI and structural namespaces out of reach", () => {
    for (const namespace of ["LaunchPad", "AiOps", "Join", "Showcase", "Navigation", "Footer", "Metadata", "NotFound", "Error", "Admin", "Portal"]) {
      expect(isPageCopyNamespace(namespace), namespace).toBe(false);
    }
    expect(isPageCopyNamespace("Privacy")).toBe(true);
    expect(isPageCopyNamespace("__proto__")).toBe(false);
    expect(isPageCopyNamespace(undefined)).toBe(false);
  });

  it("every editable namespace exists in the shipped bundle", () => {
    for (const namespace of pageCopyNamespaces) {
      expect(en, namespace).toHaveProperty(namespace);
      expect(pageCopyCatalog(namespace).length, namespace).toBeGreaterThan(0);
    }
  });

  it("exposes the agreed editable surface and nothing more", () => {
    const sizes = pageCopyCatalogSizes();

    expect(sizes).toEqual({
      // PR5 added the two editable partner-wall labels. WP-3 Task 2 added the 9
      // editable hero fields (eyebrow/title/lead/imageAlt/note/discover plus the
      // three hero actions) that components/home/hero.tsx reads. WP-3 Task 3 added
      // the 8 editable Open Now fields (eyebrow/title/intro/statusLabel plus the
      // empty-state title/copy and the two interest actions) that
      // components/home/open-now.tsx reads. WP-3 Task 4 added 23 editable Pathways
      // fields (eyebrow/title/intro plus title/copy/benefits/cta for each of the 5
      // audience cards) that components/home/pathways.tsx reads. WP-3 Task 5 added
      // 12 editable Events Journey fields (eyebrow/title/intro, title/copy for each
      // of the 3 Before/During/After stages, plus statusLabel/emptyTitle/
      // viewAllAction) that components/home/events-journey.tsx reads. WP-3 Task 6
      // added 12 editable Market Products fields (eyebrow/title, plus label/title/
      // copyEmpty/copyAvailable/action for each of the directory and marketplace
      // panels) that components/home/market-products.tsx reads. WP-3 Task 7 added
      // 9 editable Outcomes fields (eyebrow/title/intro/frameworkLabel/
      // frameworkSteps/statusLabel/emptyTitle/emptyCopy/action) that
      // components/home/outcomes.tsx reads. WP-3 Task 8 added 20 editable
      // Ecosystem fields (eyebrow/title/intro/selectedLabel/enterAction, the 3
      // focusAreas array elements, plus name/brief for each of the 6 industries)
      // that components/home/ecosystem.tsx reads. WP-3 Task 9 added 16 editable
      // Programme Showcase fields (eyebrow/title/intro/eventSeriesLabel/
      // credentialLabel/editionsFact/credentialFact/action, plus name/description
      // for each of the 4 programme cards) that components/home/
      // programme-showcase.tsx reads. WP-3 Task 10 added 5 editable GBA Gateway
      // fields (eyebrow/title/copy/openCohortAction/exploreAction) that
      // components/home/gba-gateway.tsx reads. WP-3 Task 11 added 15 editable
      // Impact Evidence fields (eyebrow/title/intro/sourceLabel/source/sourceLink,
      // plus label/definition/period for each of the 3 metric tiles) that
      // components/home/impact-evidence.tsx reads.
      Home: 174,
      About: 19,
      Chairman: 8,
      Committees: 12,
      // PR5 added 14 editable labels for the Contact concierge journeys.
      Contact: 20,
      // 12 for the four programmes' title/description/status, plus the 17
      // `programs.record` keys the programme records migration and PR3
      // presentation added. Those are page furniture -- headings, and
      // sentences with {agency}/{count} placeholders -- so staff can reword
      // them. The facts they frame come from content/programs/*.ts, which
      // /admin/page-copy cannot reach.
      programs: 29,
      // Static numeric pricing left copy, removing two editable fields.
      Membership: 32,
      Privacy: 46,
      AiTransparency: 30,
    });
    expect(Object.values(sizes).reduce((total, count) => total + count, 0)).toBe(370);
  });

  it("offers a Chinese placeholder for every English field", () => {
    for (const namespace of pageCopyNamespaces) {
      const chinese = pageCopyBundleValues("zh-HK", namespace);
      for (const {keyPath} of pageCopyCatalog(namespace)) {
        expect(chinese.get(keyPath), `${namespace}.${keyPath}`).toBeTruthy();
      }
    }
  });

  it("validates a candidate override against the real English bundle", () => {
    expect(pageCopyEnglishRejection({
      namespace: "Privacy", keyPath: "sections.0.body.0", value: "Rewritten.",
    })).toBeNull();
    expect(pageCopyEnglishRejection({
      namespace: "Privacy", keyPath: "sections.0.body.99", value: "Rewritten.",
    })).toBe("KEY_PATH_UNKNOWN");
    expect(pageCopyEnglishRejection({
      namespace: "Footer", keyPath: "copyright", value: "© HKWTIA",
    })).toBe("NAMESPACE_NOT_EDITABLE");
  });
});
