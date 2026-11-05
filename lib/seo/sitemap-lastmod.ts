import {statSync} from "node:fs";
import {join} from "node:path";

import {type PublicRoute} from "@/config/public-routes";

/**
 * Sitemap `<lastmod>` comes from a real filesystem timestamp: the page or content
 * file's mtime, or the build artifact when a route has no content file of its own.
 * Nothing here is a hand-written calendar date (SEO hygiene pack, t341s1501).
 */
const PAGE_FILE: Partial<Record<PublicRoute, string>> = {
  "/": "app/[locale]/(public)/page.tsx",
  "/join": "app/[locale]/(join)/join/page.tsx",
  "/about": "app/[locale]/(public)/about/page.tsx",
  "/about/chairman": "app/[locale]/(public)/about/chairman/page.tsx",
  "/about/committees": "app/[locale]/(public)/about/committees/page.tsx",
  "/about/history": "app/[locale]/(public)/about/history/page.tsx",
  "/membership": "app/[locale]/(public)/membership/page.tsx",
  "/showcase": "app/[locale]/(public)/showcase/page.tsx",
  "/launchpad": "app/[locale]/(public)/launchpad/page.tsx",
  "/ai-ops": "app/[locale]/(public)/ai-ops/page.tsx",
  "/events": "app/[locale]/(public)/events/page.tsx",
  "/news": "app/[locale]/(public)/news/page.tsx",
  "/media-and-press-coverage": "app/[locale]/(public)/media-and-press-coverage/page.tsx",
  "/programs/cpai": "app/[locale]/(public)/programs/cpai/page.tsx",
  "/programs/hkict": "app/[locale]/(public)/programs/hkict/page.tsx",
  "/programs/tct": "app/[locale]/(public)/programs/tct/page.tsx",
  "/programs/asa": "app/[locale]/(public)/programs/asa/page.tsx",
  "/programmes": "app/[locale]/(public)/programmes/page.tsx",
  "/contact": "app/[locale]/(public)/contact/page.tsx",
  "/partners": "app/[locale]/(public)/partners/page.tsx",
  "/privacy": "app/[locale]/(public)/privacy/page.tsx",
  "/refund-policy": "app/[locale]/(public)/refund-policy/page.tsx",
  "/ai-transparency": "app/[locale]/(public)/ai-transparency/page.tsx",
  "/members": "app/[locale]/(public)/members/page.tsx",
};

export function fileMtime(relativePath: string): Date {
  return statSync(join(process.cwd(), relativePath)).mtime;
}

/** Deploy/build stamp: the Next build id when it exists, otherwise a shipped source file. */
export function buildLastmod(): Date {
  for (const relative of [".next/BUILD_ID", "package.json", "app/sitemap.ts"]) {
    try {
      return fileMtime(relative);
    } catch {
      // The next candidate is still a real file, not a chosen calendar date.
    }
  }
  return fileMtime("lib/seo/sitemap-lastmod.ts");
}

export function staticRouteLastmod(pathname: string): Date {
  const relative = PAGE_FILE[pathname as PublicRoute];
  if (relative) {
    try {
      return fileMtime(relative);
    } catch {
      // A renamed page file falls through to the build stamp rather than dropping lastmod.
    }
  }
  return buildLastmod();
}

export function contentFileLastmod(relativePath: string): Date {
  try {
    return fileMtime(relativePath);
  } catch {
    return buildLastmod();
  }
}
