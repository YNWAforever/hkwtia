import {publicRoutes, type PublicRoute} from "@/config/public-routes";

/**
 * The message namespaces staff may edit. This is a hard-coded allowlist rather
 * than a database flag: widening it is a reviewed code change, not a click.
 *
 * Deliberately excluded are the product UI namespaces (`LaunchPad`, `AiOps`,
 * `Join`, `Showcase`) and the structural ones (`Navigation`, `Footer`,
 * `Metadata`, `NotFound`, `Error`). Renaming a form field or a chart axis
 * through a CMS is risk without benefit.
 */
export const pageCopyNamespaces = [
  "Home",
  "About",
  "Chairman",
  "Committees",
  "Contact",
  "programs",
  "Membership",
  "Privacy",
  "AiTransparency",
] as const;

export type PageCopyNamespace = (typeof pageCopyNamespaces)[number];

/**
 * The public routes each namespace renders on, so a save invalidates exactly
 * the pages it can change. Every entry must be a real `publicRoutes` member —
 * a typo would silently stop invalidation, so a test asserts the mapping.
 */
export const pageCopyRoutes: Readonly<Record<PageCopyNamespace, readonly PublicRoute[]>> = {
  Home: ["/"],
  About: ["/about"],
  Chairman: ["/about/chairman"],
  Committees: ["/about/committees"],
  Contact: ["/contact"],
  programs: ["/programs/cpai", "/programs/hkict", "/programs/tct", "/programs/asa"],
  Membership: ["/membership"],
  Privacy: ["/privacy"],
  AiTransparency: ["/ai-transparency"],
};

const namespaceSet: ReadonlySet<string> = new Set(pageCopyNamespaces);
const routeSet: ReadonlySet<string> = new Set(publicRoutes);

export function isPageCopyNamespace(value: unknown): value is PageCopyNamespace {
  return typeof value === "string" && namespaceSet.has(value);
}

export function isPublicRoute(value: unknown): value is PublicRoute {
  return typeof value === "string" && routeSet.has(value);
}
