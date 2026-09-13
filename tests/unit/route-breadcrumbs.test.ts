import {describe, expect, it} from "vitest";

import {publicRoutes} from "@/config/public-routes";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import {ROUTE_BREADCRUMB_LABEL_KEYS, routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";

const translate = (messages: Record<string, unknown>) => (key: string): string => {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
  if (typeof value !== "string") throw new Error(`missing message: ${key}`);
  return value;
};

describe("routeBreadcrumbItems", () => {
  it("gives every public route a label that resolves in both bundles", () => {
    // A route with no label throws MISSING_MESSAGE at request time and takes the page
    // down -- the exact shape of the /admin/page-copy outage of 2026-09-13.
    for (const route of publicRoutes) {
      const key = ROUTE_BREADCRUMB_LABEL_KEYS[route];
      expect(key, `${route} has no breadcrumb label key`).toBeDefined();
      expect(() => translate(en)(key!), `en: ${key}`).not.toThrow();
      expect(() => translate(zhHK)(key!), `zh-HK: ${key}`).not.toThrow();
    }
    // Held equal, so a label left behind by a deleted route surfaces too.
    expect(Object.keys(ROUTE_BREADCRUMB_LABEL_KEYS).sort()).toEqual([...publicRoutes].sort());
  });

  it("starts every trail at home and ends at the current page", () => {
    const items = routeBreadcrumbItems("en", "/about/chairman", translate(en));

    expect(items).toHaveLength(3);
    // absoluteUrl falls back to this host when NEXT_PUBLIC_SITE_URL is unset, which is how
    // every other unit test in this repo (metadata.test.ts, sitemap.test.ts, ...) asserts it.
    expect(items[0]).toEqual({name: "Home", url: "http://localhost:3000/"});
    expect(items[1]!.url).toBe("http://localhost:3000/about");
    expect(items[2]!.url).toBe("http://localhost:3000/about/chairman");
  });

  it("returns no trail for the home page itself, which has nowhere to point back to", () => {
    expect(routeBreadcrumbItems("en", "/", translate(en))).toEqual([]);
  });

  it("localises the trail through localizedPath, never a hand-built prefix", () => {
    const items = routeBreadcrumbItems("zh-HK", "/about/chairman", translate(zhHK));

    // CLAUDE.md hard boundary 5: zh-HK is served at /zh. A literal `/zh-HK/...` here
    // would be invisible until a crawler read it. The home trail item is exactly "/zh"
    // with no trailing slash -- localizedPath's own root-path case (also relied on by
    // lib/ai/concierge-prompts.ts) -- so this checks for the prefix, not "/zh/".
    for (const item of items) {
      expect(item.url).toContain("/zh");
      expect(item.url).not.toContain("/zh-HK/");
    }
  });

  it("skips intermediate segments that are not themselves public routes", () => {
    // /programs is not in publicRoutes -- only /programs/<name> is -- so a trail for a
    // programme page must not invent a link to a page that does not exist.
    const items = routeBreadcrumbItems("en", "/programs/hkict", translate(en));

    expect(items.map((i) => i.url)).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/programs/hkict",
    ]);
  });
});
