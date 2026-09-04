"use client";

import {useState} from "react";

import {MegaMenuPanel} from "@/components/layout/mega-menu-panel";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu";
import type {LocalizedNavigationGroup} from "@/config/navigation";
import {usePathname} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type DesktopMegaNavigationProps = {
  groups: readonly LocalizedNavigationGroup[];
  primaryLabel: string;
  exploreLabel: string;
  viewOverviewLabel: string;
};

/** Prefix match: `/about/history` keeps the About group marked as the current section. */
export function pathBelongsToGroup(pathname: string, group: LocalizedNavigationGroup): boolean {
  return group.columns.some((column) => column.links.some(({href}) =>
    pathname === href || pathname.startsWith(`${href}/`),
  ));
}

// Donor commit f91ecc5 :423-444 — .mega-menu-v2 is a two-part panel: the main side with an
// "Explore <group>" heading, a "View overview" link and titled columns, and a feature aside.
// Radix keeps the keyboard contract (roving arrows, ArrowDown entry, Escape return, outside
// pointer-down close); nothing here overrides its timings.
export function DesktopMegaNavigation({
  groups,
  primaryLabel,
  exploreLabel,
  viewOverviewLabel,
}: DesktopMegaNavigationProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState("");
  /**
   * A click on a panel link closes it through `onNavigate`; Back and Forward are navigations no
   * click reports. This nav is mounted by app/[locale]/(public)/layout.tsx, which survives them,
   * and Radix's NavigationMenu listens for keydown, pointerdown and focusin only — its bundle
   * names no `popstate`, `hashchange` or `window.history` — so the panel stayed open over the
   * page the reader had just gone back to. Compared during render, the way the Concierge reads
   * its section (components/ai/concierge-widget.tsx:230-241): React re-runs this component
   * before committing, so no frame paints the stale panel. No focus is moved here — a history
   * navigation is not a link the reader activated, and Radix returns focus on close by itself.
   */
  const [renderedRoute, setRenderedRoute] = useState(pathname);
  if (renderedRoute !== pathname) {
    setRenderedRoute(pathname);
    setOpenGroup("");
  }

  function closeAndReturnFocus(groupId: string) {
    setOpenGroup("");
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-navigation-trigger="${groupId}"]`)?.focus();
    });
  }

  return (
    <nav className="desktop-nav" aria-label={primaryLabel}>
      <NavigationMenu value={openGroup} onValueChange={setOpenGroup}>
        <NavigationMenuList>
          {groups.map((group) => {
            const current = pathBelongsToGroup(pathname, group);
            return (
              <NavigationMenuItem key={group.id} value={group.id}>
                <NavigationMenuTrigger
                  data-navigation-trigger={group.id}
                  data-current={current ? "true" : undefined}
                  className={cn(
                    "nav-button",
                    group.eventFirst && "event-first",
                    current && "current",
                    openGroup === group.id && "active",
                  )}
                >
                  {group.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <MegaMenuPanel
                    group={group}
                    exploreLabel={exploreLabel}
                    viewOverviewLabel={viewOverviewLabel}
                    pathname={pathname}
                    onNavigate={() => closeAndReturnFocus(group.id)}
                  />
                </NavigationMenuContent>
              </NavigationMenuItem>
            );
          })}
        </NavigationMenuList>
        <NavigationMenuViewport />
      </NavigationMenu>
    </nav>
  );
}
