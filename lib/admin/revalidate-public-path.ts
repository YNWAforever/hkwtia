import "server-only";

import {revalidatePath} from "next/cache";

import {publicRoutes} from "@/config/public-routes";
import {routing} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

// The localized form of every known public route, precomputed so validation is
// a set membership test rather than a pattern that could drift from the routes.
const allowedPaths: ReadonlySet<string> = new Set(
  routing.locales.flatMap((locale) => publicRoutes.map((route) => localizedPath(locale, route))),
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
    .map((locale) => localizedPath(locale, route))
    .filter((path) => revalidatePublicPath(path));
}
