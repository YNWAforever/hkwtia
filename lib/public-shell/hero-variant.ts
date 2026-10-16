import type {PublicRoute} from "@/config/public-routes";

/**
 * The donor header is always transparent and absolutely positioned over a full-bleed photo
 * hero. hkwtia has public pages with no hero at all, where white-on-white chrome would be
 * invisible, so "solid" is the group default and "overlay" is opted into per route.
 * WP-3 and WP-4 extend the map as each page gains its donor hero.
 */
export type SiteHeaderVariant = "overlay" | "solid";

export const DEFAULT_HEADER_VARIANT: SiteHeaderVariant = "solid";

export const heroVariantByRoute = {
  "/": "overlay",
} as const satisfies Partial<Record<PublicRoute, SiteHeaderVariant>>;

/** `pathname` is the locale-stripped path from `usePathname` in `@/i18n/navigation`. */
export function resolveHeaderVariant(pathname: string): SiteHeaderVariant {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (heroVariantByRoute as Record<string, SiteHeaderVariant | undefined>)[normalized] ?? DEFAULT_HEADER_VARIANT;
}
