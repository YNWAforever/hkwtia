"use client";

import {useEffect, useState, type ComponentType} from "react";

import type {LocalizedNavigationGroup} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

// `.desktop-nav { display: none }` at max-width 1120px (app/styles/wisetech.css).
// Lighthouse's mobile viewport is 412px, so the Radix mega menu never paints there.
// Loading it on every visit still evaluated @radix-ui/react-navigation-menu during
// the first tasks (Weekly Lighthouse run 40850403806: homepage TBT 510ms, /events
// first paint blocked until those tasks yielded). The static links are the
// no-JS and first-paint navigation; the menu replaces them only when the
// viewport can show it.
const DESKTOP_NAV_QUERY = "(min-width: 1121px)";

type DesktopNavGateProps = {
  groups: readonly LocalizedNavigationGroup[];
  primaryLabel: string;
  exploreLabel: string;
  viewOverviewLabel: string;
};

function pathBelongsToGroup(pathname: string, group: LocalizedNavigationGroup) {
  return group.columns.some((column) => column.links.some(({href}) =>
    pathname === href || pathname.startsWith(`${href}/`),
  ));
}

function StaticDesktopNav({groups, primaryLabel}: DesktopNavGateProps) {
  const pathname = usePathname();

  return (
    <nav className="desktop-nav" aria-label={primaryLabel}>
      <ul className="desktop-nav-list">
        {groups.map((group) => {
          const current = pathBelongsToGroup(pathname, group);
          return (
            <li key={group.id}>
              <Link
                className={cn("nav-button", group.eventFirst && "event-first", current && "current")}
                data-navigation-trigger={group.id}
                data-current={current ? "true" : undefined}
                href={group.landingHref}
                prefetch={false}
              >
                {group.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopNavGate(props: DesktopNavGateProps) {
  const [Nav, setNav] = useState<ComponentType<DesktopNavGateProps> | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DESKTOP_NAV_QUERY);
    let cancelled = false;
    const load = () => {
      if (!media.matches || cancelled) return;
      void import("./desktop-mega-navigation").then((mod) => {
        if (!cancelled) setNav(() => mod.DesktopMegaNavigation);
      });
    };
    load();
    media.addEventListener("change", load);
    return () => {
      cancelled = true;
      media.removeEventListener("change", load);
    };
  }, []);

  if (!Nav) return <StaticDesktopNav {...props} />;
  return <Nav {...props} />;
}
