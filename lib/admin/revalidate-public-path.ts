import "server-only";

import {revalidatePath} from "next/cache";

import {publicRoutes} from "@/config/public-routes";
import {routing} from "@/i18n/routing";

/**
 * The internal router path, which is not the browser URL.
 *
 * `localizedPath` produces what a visitor sees — `/about`, `/zh/about` — and
 * that is right for a `<Link>`. It is wrong here. next-intl's proxy rewrites
 * those to `/en/about` and `/zh-HK/about` before the router sees them, and
 * `revalidatePath` matches its argument against the rewritten path. The
 * prerendered pages carry `_N_T_/en/about` and `_N_T_/zh-HK/about` as their
 * cache tags; neither `_N_T_/about` nor `_N_T_/zh/about` exists, so the
 * localized form invalidated nothing at all.
 *
 * It went unnoticed because it fails silently and only bites here.
 * `revalidatePath` reports nothing for an unmatched tag, the other callers
 * (news, showcase, portal, launchpad) target `force-dynamic` routes where a
 * missed invalidation has no effect, and these page-copy routes are the only
 * statically prerendered targets. They also carry
 * `initialRevalidateSeconds: false`, so nothing expired on its own — a staff
 * copy edit stayed invisible on the public site until the next deploy.
 */
function internalPath(locale: string, route: string): string {
  return route === "/" ? `/${locale}` : `/${locale}${route}`;
}

// Precomputed so validation is a set membership test rather than a pattern that
// could drift from the routes.
const allowedPaths: ReadonlySet<string> = new Set(
  routing.locales.flatMap((locale) => publicRoutes.map((route) => internalPath(locale, route))),
);

/**
 * The admin counterpart (`revalidateAdminPath`) confines invalidation to the
 * staff surface. Page-copy edits change public pages instead, so they need the
 * mirror guard: an exact match against the declared public routes, both locale
 * variants, and nothing else.
 */
export function revalidatePublicPath(path: string): boolean {
  if (!allowedPaths.has(path)) return false;
  revalidatePath(path);
  return true;
}

/** Revalidates one public route in every locale. Returns the paths invalidated. */
export function revalidatePublicRoute(route: string): readonly string[] {
  return routing.locales
    .map((locale) => internalPath(locale, route))
    .filter((path) => revalidatePublicPath(path));
}
