import type {PublicRoute} from "@/config/public-routes";

/**
 * The donor header was transparent over a full-bleed photo hero. Willy Approve t341s1501
 * (Catherine Phase 3) makes the public header a light bar on every route: white ground,
 * navy navigation, full-colour black-text logo. Overlay (white type on the hero) is no
 * longer opted in. The map stays so a later route can opt back in without rewriting the
 * resolver. Q6b (serif vs sans headings) and Q8 (favicon) are unchanged here.
 */
export type SiteHeaderVariant = "overlay" | "solid";

export const DEFAULT_HEADER_VARIANT: SiteHeaderVariant = "solid";

export const heroVariantByRoute = {} as const satisfies Partial<Record<PublicRoute, SiteHeaderVariant>>;

/** `pathname` is the locale-stripped path from `usePathname` in `@/i18n/navigation`. */
export function resolveHeaderVariant(pathname: string): SiteHeaderVariant {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (heroVariantByRoute as Record<string, SiteHeaderVariant | undefined>)[normalized] ?? DEFAULT_HEADER_VARIANT;
}
