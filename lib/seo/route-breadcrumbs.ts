import {publicRoutes, type PublicRoute} from "@/config/public-routes";
import type {AppLocale} from "@/i18n/routing";
import type {BreadcrumbItem} from "@/lib/structured-data";
import {absoluteUrl, localizedPath} from "@/lib/urls";

/**
 * The message key naming each public route in a breadcrumb trail.
 *
 * Eighteen of these point at `Navigation.links.*`, which already names the same pages in
 * the header: a second vocabulary for the same routes would be one more thing for staff
 * to keep in sync, and it would drift. Only the four routes the navigation does not list
 * carry their own key.
 *
 * Held equal to `publicRoutes` by `tests/unit/route-breadcrumbs.test.ts`. A route without
 * a label throws MISSING_MESSAGE at request time and takes the page down -- exactly how
 * /admin/page-copy broke in both locales on 2026-09-13.
 */
export const ROUTE_BREADCRUMB_LABEL_KEYS: Readonly<Partial<Record<PublicRoute, string>>> = {
  "/": "Common.breadcrumbHome",
  "/join": "Common.breadcrumbJoin",
  "/privacy": "Common.breadcrumbPrivacy",
  "/refund-policy": "Common.breadcrumbRefundPolicy",
  "/members": "Common.breadcrumbMembers",
  "/about": "Navigation.links.about",
  "/about/chairman": "Navigation.links.chairman",
  "/about/committees": "Navigation.links.committees",
  "/about/history": "Navigation.links.history",
  "/membership": "Navigation.links.membership",
  "/showcase": "Navigation.links.showcase",
  "/launchpad": "Navigation.links.launchpad",
  "/ai-ops": "Navigation.links.aiOps",
  "/events": "Navigation.links.events",
  "/news": "Navigation.links.news",
  "/programs/cpai": "Navigation.links.cpai",
  "/programs/hkict": "Navigation.links.hkict",
  "/programs/tct": "Navigation.links.tct",
  "/programs/asa": "Navigation.links.asa",
  "/programmes": "Navigation.links.programmes",
  "/contact": "Navigation.links.contact",
  "/partners": "Navigation.links.partners",
  "/ai-transparency": "Navigation.links.aiTransparency",
};

const publicRouteSet: ReadonlySet<string> = new Set(publicRoutes);

/** Every ancestor path of `/a/b/c`, shallowest first, excluding "/" and the path itself. */
function ancestorsOf(pathname: string): readonly string[] {
  const segments = pathname.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => `/${segments.slice(0, index + 1).join("/")}`);
}

/**
 * The trail for a static public route: home, then each ancestor that is itself a public
 * route, then the page.
 *
 * Ancestors that are not public routes are skipped rather than linked. `/programs` is the
 * case that matters -- only `/programs/<name>` exists -- and a breadcrumb offering a link
 * to a page that 404s is worse than a shorter trail.
 *
 * `translate` is passed in rather than imported so this stays a pure function the tests
 * can drive with either bundle. Callers hand it next-intl's `t` scoped to the root.
 */
export function routeBreadcrumbItems(
  locale: AppLocale,
  pathname: PublicRoute,
  translate: (key: string) => string,
): readonly BreadcrumbItem[] {
  // The home page is the root of every other trail and so has none of its own.
  if (pathname === "/") return [];

  const own = ROUTE_BREADCRUMB_LABEL_KEYS[pathname];
  if (!own) return [];

  const trail: BreadcrumbItem[] = [
    {name: translate("Common.breadcrumbHome"), url: absoluteUrl(localizedPath(locale, "/"))},
  ];
  for (const ancestor of ancestorsOf(pathname)) {
    if (!publicRouteSet.has(ancestor)) continue;
    const key = ROUTE_BREADCRUMB_LABEL_KEYS[ancestor as PublicRoute];
    if (!key) continue;
    trail.push({name: translate(key), url: absoluteUrl(localizedPath(locale, ancestor))});
  }
  trail.push({name: translate(own), url: absoluteUrl(localizedPath(locale, pathname))});
  return trail;
}
