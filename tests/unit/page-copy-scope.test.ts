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
      Home: 32,
      About: 19,
      Chairman: 8,
      Committees: 12,
      Contact: 6,
      programs: 12,
      Membership: 34,
      Privacy: 46,
      AiTransparency: 30,
    });
    expect(Object.values(sizes).reduce((total, count) => total + count, 0)).toBe(199);
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
