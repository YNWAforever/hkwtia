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
