import {revalidatePath} from "next/cache";
import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));

import {publicRoutes} from "@/config/public-routes";
import {revalidatePublicPath, revalidatePublicRoute} from "@/lib/admin/revalidate-public-path";

const revalidate = vi.mocked(revalidatePath);

describe("public revalidate path guard", () => {
  beforeEach(() => {
    revalidate.mockClear();
  });

  it.each([
    "/",
    "/zh",
    "/privacy",
    "/zh/privacy",
    "/about/chairman",
    "/zh/about/chairman",
    "/programs/cpai",
    "/zh/ai-transparency",
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
    ["the English prefix the router never emits", "/en/privacy"],
    ["an empty path", ""],
  ])("refuses %s", (_case, path) => {
    expect(revalidatePublicPath(path)).toBe(false);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("revalidates both locale variants of a route", () => {
    expect(revalidatePublicRoute("/privacy")).toEqual(["/privacy", "/zh/privacy"]);
    expect(revalidate.mock.calls).toEqual([["/privacy"], ["/zh/privacy"]]);
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
});
