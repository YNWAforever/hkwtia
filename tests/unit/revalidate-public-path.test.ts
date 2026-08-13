import {revalidatePath} from "next/cache";
import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));

import {publicRoutes} from "@/config/public-routes";
import {routing} from "@/i18n/routing";
import {revalidatePublicPath, revalidatePublicRoute} from "@/lib/admin/revalidate-public-path";

const revalidate = vi.mocked(revalidatePath);

describe("public revalidate path guard", () => {
  beforeEach(() => {
    revalidate.mockClear();
  });

  // These are internal router paths. next-intl's proxy rewrites /about to
  // /en/about and /zh/about to /zh-HK/about, and revalidatePath matches the
  // rewritten path — so the browser URL form invalidates nothing.
  it.each([
    "/en",
    "/zh-HK",
    "/en/privacy",
    "/zh-HK/privacy",
    "/en/about/chairman",
    "/zh-HK/about/chairman",
    "/en/programs/cpai",
    "/zh-HK/ai-transparency",
  ])("revalidates the declared public path %s", (path) => {
    expect(revalidatePublicPath(path)).toBe(true);
    expect(revalidate).toHaveBeenCalledWith(path);
  });

  it.each([
    ["the admin surface", "/en/admin/page-copy"],
    ["a member surface", "/portal"],
    ["an undeclared page", "/about/history"],
    ["a traversal attempt", "/privacy/../admin"],
    ["a protocol-relative host", "//evil.example.com"],
    ["an absolute url", "https://evil.example.com/privacy"],
    ["a query string", "/privacy?x=1"],
    ["a trailing slash", "/privacy/"],
    ["an unmapped locale prefix", "/fr/privacy"],
    ["the browser URL form, which matches no cache tag", "/privacy"],
    ["the browser URL form for zh-HK", "/zh/privacy"],
    ["the bare root browser URL", "/"],
    ["an empty path", ""],
  ])("refuses %s", (_case, path) => {
    expect(revalidatePublicPath(path)).toBe(false);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("revalidates both locale variants of a route", () => {
    expect(revalidatePublicRoute("/privacy")).toEqual(["/en/privacy", "/zh-HK/privacy"]);
    expect(revalidate.mock.calls).toEqual([["/en/privacy"], ["/zh-HK/privacy"]]);
  });

  it("revalidates nothing for a route that is not public", () => {
    expect(revalidatePublicRoute("/admin/page-copy")).toEqual([]);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("accepts every declared public route in both locales", () => {
    for (const route of publicRoutes) {
      expect(revalidatePublicRoute(route), route).toHaveLength(2);
    }
  });

  // The mock hides whether a path actually matches a cache tag, so pin the
  // shape directly: a future refactor reaching for localizedPath again would
  // emit /about and /zh/about and silently stop invalidating anything.
  it("emits the internal router path for every route and locale", () => {
    for (const route of publicRoutes) {
      revalidate.mockClear();
      revalidatePublicRoute(route);
      expect(revalidate.mock.calls.map(([path]) => path), route).toEqual(
        routing.locales.map((locale) => (route === "/" ? `/${locale}` : `/${locale}${route}`)),
      );
    }
  });
});
