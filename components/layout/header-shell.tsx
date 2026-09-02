"use client";

import {useEffect, useState, type ReactNode} from "react";

import {usePathname} from "@/i18n/navigation";
import {resolveHeaderVariant} from "@/lib/public-shell/hero-variant";
import {cn} from "@/lib/utils";

/** Donor commit f91ecc5 :236-241 — solid chrome once the reader is past the hero. */
const SCROLLED_THRESHOLD = 56;

type HeaderShellProps = {
  hasAnnouncement: boolean;
  children: ReactNode;
};

/**
 * The `<header>` element itself, as a client component, so `data-variant` is part of the
 * server-rendered HTML.
 *
 * app/[locale]/(public)/layout.tsx cannot resolve it: an App Router layout has no pathname,
 * and the only server-side source — a path forwarded from proxy.ts and read with `headers()` —
 * opts the whole public route group out of static and ISR rendering, which /ai-ops
 * (`revalidate = 300`) and the twelve page-copy routes depend on. Writing the attribute from an
 * effect instead is worse: `solid` is `position: sticky` and in flow while `overlay` is
 * `position: absolute` and out of it, so every load of the home page would shift its content up
 * by the header's height after hydration, against the CLS < 0.05 target in spec §6.
 *
 * `usePathname` is safe here during static rendering: it is `useContext(PathnameContext)`
 * (next/dist/client/components/navigation.js:125), the provider is rendered by AppRouter on the
 * server (app-router.js:435), and the dynamic-params bail applies only to prerender-client and
 * prerender-ppr with fallback params (server/app-render/dynamic-rendering.js:524-583).
 * components/layout/desktop-mega-navigation.tsx:30 already calls it on every static public
 * route. See errata E-13.
 */
export function HeaderShell({hasAnnouncement, children}: HeaderShellProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLLED_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, {passive: true});
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn("site-header", !hasAnnouncement && "no-announcement", scrolled && "scrolled")}
      data-variant={resolveHeaderVariant(pathname)}
    >
      {children}
    </header>
  );
}
