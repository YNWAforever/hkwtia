import {describe, expect, it} from "vitest";

import {siteConfig} from "@/config/site";
import {brandedTitle} from "@/lib/metadata";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

// Nested `metaTitle`-named keys that are intentionally excluded from the brand-suffix rule
// because they are not page titles rendered via generateMetadata. Empty: a grep across
// messages/en.json and app/ confirmed every `metaTitle` key sits at namespace-top-level and
// feeds a page's generateMetadata() directly (see docs/superpowers/plans WP-7 task 8 notes).
const allowlist = new Set<string>([]);

function walk(value: unknown, path: string, out: [string, string][]): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === "metaTitle" && typeof child === "string") {
      out.push([childPath, child]);
      continue;
    }
    walk(child, childPath, out);
  }
}

function metaTitles(bundle: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  walk(bundle, "", out);
  return out.filter(([namespace]) => !allowlist.has(namespace));
}

// Design D-1: the public brand is WiseTech Hong Kong; WTIA stays the legal short name in
// openGraph.siteName and the copy, not in the title suffix.
describe("page titles", () => {
  it("declares the same set of metaTitle keys in both bundles", () => {
    const englishKeys = metaTitles(en).map(([namespace]) => namespace).sort();
    const chineseKeys = metaTitles(zh).map(([namespace]) => namespace).sort();
    expect(englishKeys.length).toBeGreaterThanOrEqual(16);
    expect(chineseKeys).toEqual(englishKeys);
  });

  it("suffixes every English metaTitle with the public brand", () => {
    const titles = metaTitles(en);
    expect(titles.length).toBeGreaterThanOrEqual(16);
    for (const [namespace, title] of titles) {
      expect(title === siteConfig.publicBrand || title.endsWith(` | ${siteConfig.publicBrand}`), `${namespace}: ${title}`).toBe(true);
      expect(title, namespace).not.toMatch(/\| WTIA$/);
      expect(title, namespace).not.toContain("WTIA");
    }
    expect(en.Metadata.title).toBe(siteConfig.publicBrand);
  });

  it("suffixes every Chinese metaTitle with the fullwidth separator and the same brand", () => {
    for (const [namespace, title] of metaTitles(zh)) {
      expect(title === siteConfig.publicBrand || title.endsWith(`｜${siteConfig.publicBrand}`), `${namespace}: ${title}`).toBe(true);
      expect(title, namespace).not.toContain("WTIA");
      // The fullwidth bar carries its own spacing; an ASCII " | " would render a doubled gap.
      expect(title, namespace).not.toContain(" | ");
    }
    expect(zh.Metadata.title).toBe(siteConfig.publicBrand);
  });

  // Record-titled pages (events, news, showcase, history) and the lowercase-namespace programme
  // pages brand at runtime through this helper instead of a metaTitle key.
  it("brands a runtime title with the same locale-specific suffix the bundles use", () => {
    expect(brandedTitle("en", "Harbour Vision AI")).toBe("Harbour Vision AI | WiseTech Hong Kong");
    expect(brandedTitle("zh-HK", "港灣視野 AI")).toBe("港灣視野 AI｜WiseTech Hong Kong");
    expect(brandedTitle("zh-HK", "港灣視野 AI")).not.toContain(" | ");
    expect(siteConfig.publicBrand).toBe("WiseTech Hong Kong");
    // openGraph.siteName stays the legal short name; only <title> carries the public brand.
    expect(siteConfig.shortName).toBe("WTIA");
  });
});
