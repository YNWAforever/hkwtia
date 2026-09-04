import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {describe, expect, it} from "vitest";

import {localizeNavigation, navigationGroups} from "@/config/navigation";
import {publicRoutes} from "@/config/public-routes";
import {wisetechIntegrationManifest} from "@/config/wisetech-integration-manifest";

const retained = new Set(
  wisetechIntegrationManifest
    .filter(({kind, disposition}) => kind === "route" && disposition === "retain")
    .map(({canonicalPath}) => canonicalPath),
);

function messageAt(bundle: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (current, segment) =>
      current === null || typeof current !== "object" ? undefined : (current as Record<string, unknown>)[segment],
    bundle,
  );
}

describe("navigation feature aside", () => {
  it("gives every canonical group one feature whose href is a retained public route", () => {
    expect(navigationGroups).toHaveLength(4);
    for (const group of navigationGroups) {
      expect(publicRoutes, group.id).toContain(group.feature.href);
      expect(retained.has(group.feature.href), group.id).toBe(true);
    }
    expect(navigationGroups.map((group) => group.feature.href)).toEqual([
      "/events", "/contact", "/ai-transparency", "/about/history",
    ]);
  });

  it("resolves every feature key in both bundles to a non-empty string", () => {
    for (const group of navigationGroups) {
      for (const key of [group.feature.labelKey, group.feature.titleKey, group.feature.copyKey, group.feature.ctaKey]) {
        for (const [name, bundle] of [["en", en], ["zh-HK", zh]] as const) {
          const value = messageAt(bundle, `Navigation.${key}`);
          expect(typeof value, `${name}:${key}`).toBe("string");
          expect((value as string).trim().length, `${name}:${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("carries the feature into the localized view model", () => {
    const view = localizeNavigation((key) => `translated:${key}`);
    expect(view.groups[0]?.feature).toEqual({
      label: "translated:feature.eventsProgrammes.label",
      title: "translated:feature.eventsProgrammes.title",
      copy: "translated:feature.eventsProgrammes.copy",
      cta: "translated:feature.eventsProgrammes.cta",
      href: "/events",
    });
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("adds the shell chrome keys the donor grammar needs, in both bundles", () => {
    for (const key of [
      "Navigation.explore", "Navigation.viewOverview", "Navigation.search",
      "Navigation.brand.descriptor",
      "Navigation.mobile.priority", "Navigation.mobile.utilities", "Navigation.mobile.exploreEcosystem",
      "Footer.tagline", "Footer.legalLine", "Footer.brand.descriptor",
      "Footer.columns.explore", "Footer.columns.membership", "Footer.columns.about", "Footer.columns.contact",
      "Footer.newsletter.eyebrow", "Footer.newsletter.title", "Footer.newsletter.emailLabel",
      "Footer.newsletter.placeholder", "Footer.newsletter.submit", "Footer.newsletter.success",
      "Footer.newsletter.error", "Footer.newsletter.mailSubject", "Footer.newsletter.mailBody",
      "Concierge.transparency",
    ]) {
      for (const [name, bundle] of [["en", en], ["zh-HK", zh]] as const) {
        expect(typeof messageAt(bundle, key), `${name}:${key}`).toBe("string");
      }
    }
    expect(messageAt(en, "Concierge.launcher")).toBe("Ask WiseTech");
    expect(messageAt(zh, "Concierge.launcher")).toBe("問 WiseTech");
    expect(messageAt(en, "Footer.newsletter.mailBody")).toContain("{email}");
    expect(messageAt(zh, "Footer.newsletter.mailBody")).toContain("{email}");
    // The operator line is replaced by the D-10 descriptor; leaving it behind would let a
    // component keep rendering "Operated by WTIA" and pass parity.
    expect(messageAt(en, "Navigation.brand.operator")).toBeUndefined();
    expect(messageAt(en, "Footer.brand.operator")).toBeUndefined();
  });
});
