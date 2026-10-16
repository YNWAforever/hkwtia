import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {publicRoutes} from "@/config/public-routes";

const PUBLIC_DIR = join("app", "[locale]", "(public)");

/**
 * Route groups other than `(public)` that nonetheless back a `publicRoutes` entry.
 *
 * `/join` is the only one: it opens the signup funnel, so it lives with the rest of
 * that funnel under `(join)` and takes that group's layout, not the public one. The
 * route is still public, still in the sitemap, and still needs a trail -- so it is
 * mapped here rather than dropped from the coverage list.
 */
const ROUTE_GROUP_OVERRIDES: Readonly<Record<string, string>> = {
  "/join": join("app", "[locale]", "(join)"),
};

/** The page file backing a static public route. */
function pageFileFor(route: string): string {
  const dir = ROUTE_GROUP_OVERRIDES[route] ?? PUBLIC_DIR;
  return route === "/" ? join(dir, "page.tsx") : join(dir, ...route.split("/").filter(Boolean), "page.tsx");
}

describe("breadcrumb coverage", () => {
  it.each(publicRoutes.filter((route) => route !== "/"))(
    "%s renders the shared breadcrumb",
    (route) => {
      // Per page because a server layout cannot read the pathname. That makes drift the
      // real risk, so it is this test -- not a single render site -- that guarantees
      // coverage. A new public route fails here until it opts in.
      const source = readFileSync(pageFileFor(route), "utf8");
      expect(source, `${route} must call routeBreadcrumbItems`).toContain("routeBreadcrumbItems");
      expect(source, `${route} must render the trail`).toContain("buildBreadcrumbData");
    },
  );

  it("does not put a trail on the home page, which is the root of every other trail", () => {
    const source = readFileSync(pageFileFor("/"), "utf8");
    expect(source).not.toContain("routeBreadcrumbItems");
  });
});
