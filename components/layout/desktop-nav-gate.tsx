"use client";

import {useEffect, useState, type ComponentType} from "react";

import type {LocalizedNavigationGroup} from "@/config/navigation";
import {usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";
import {cn} from "@/lib/utils";

// `.desktop-nav` is `display: none` through 1240px. An earlier max-width:1120px
// rule is overridden by the later max-width:1240px rule in app/styles/wisetech.css,
// so the menu cannot paint until 1241px. Lighthouse's mobile viewport is 412px.
// Loading Radix on every visit still evaluated @radix-ui/react-navigation-menu
// during the first tasks (Weekly Lighthouse run 40850403806: homepage TBT 510ms,
// /events first paint blocked until those tasks yielded). The static links are
// the no-JS and first-paint navigation; the menu replaces them only when the
// viewport can show it.
const DESKTOP_NAV_QUERY = "(min-width: 1241px)";

type DesktopNavGateProps = {
  locale: AppLocale;
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

function StaticDesktopNav({locale, groups, primaryLabel}: DesktopNavGateProps) {
  const pathname = usePathname();

  return (
    <nav className="desktop-nav" aria-label={primaryLabel}>
      <ul className="desktop-nav-list">
        {groups.map((group) => {
          const current = pathBelongsToGroup(pathname, group);
          return (
            <li key={group.id}>
              {/* Plain anchor, already localized. A next-intl Link here would prefetch
                  the landing pages during first paint, which is the request the hero
                  was losing to, and a client Link is not available before hydration. */}
              <a
                className={cn("nav-button", group.eventFirst && "event-first", current && "current")}
                data-navigation-trigger={group.id}
                data-current={current ? "true" : undefined}
                href={localizedPath(locale, group.landingHref)}
              >
                {group.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopNavGate({locale, ...props}: DesktopNavGateProps) {
  const [Nav, setNav] = useState<ComponentType<Omit<DesktopNavGateProps, "locale">> | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DESKTOP_NAV_QUERY);
    let cancelled = false;
    const load = () => {
      if (!media.matches || cancelled) return;
      void import("./desktop-mega-navigation").then((mod) => {
        if (!cancelled) setNav(() => mod.DesktopMegaNavigation);
      }).catch(() => {
        // Keep the server-rendered overview links usable if the menu chunk fails to load.
      });
    };
    load();
    media.addEventListener("change", load);
    return () => {
      cancelled = true;
      media.removeEventListener("change", load);
    };
  }, []);

  if (!Nav) return <StaticDesktopNav locale={locale} {...props} />;
  return <Nav {...props} />;
}
