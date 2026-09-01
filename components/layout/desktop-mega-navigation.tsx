"use client";

import {useState} from "react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu";
import type {LocalizedNavigationGroup} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type DesktopMegaNavigationProps = {
  groups: readonly LocalizedNavigationGroup[];
  primaryLabel: string;
};

export function pathBelongsToGroup(pathname: string, group: LocalizedNavigationGroup): boolean {
  return group.columns.some((column) => column.links.some(({href}) =>
    pathname === href || pathname.startsWith(`${href}/`),
  ));
}

export function DesktopMegaNavigation({groups, primaryLabel}: DesktopMegaNavigationProps) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState("");

  function closeAndReturnFocus(groupId: string) {
    setOpenGroup("");
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-navigation-trigger="${groupId}"]`)?.focus();
    });
  }

  return (
    <nav aria-label={primaryLabel}>
      <NavigationMenu className="relative" value={openGroup} onValueChange={setOpenGroup}>
        <NavigationMenuList>
          {groups.map((group) => {
            const current = pathBelongsToGroup(pathname, group);
            return (
              <NavigationMenuItem key={group.id} value={group.id}>
                <NavigationMenuTrigger
                  data-navigation-trigger={group.id}
                  data-current={current ? "true" : undefined}
                  className={cn(group.eventFirst && "bg-shell-blue text-white hover:bg-shell-navy data-[state=open]:bg-shell-navy data-[current=true]:text-white")}
                >
                  {group.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[min(36rem,calc(100vw_-_2rem))] max-w-[calc(100vw_-_2rem)] grid-cols-1 gap-6 p-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8 sm:p-6">
                    <div className="rounded-shell-lg bg-shell-warm p-5">
                      <p className="text-lg font-bold text-shell-ink">{group.label}</p>
                      <p className="mt-2 text-sm leading-6 text-shell-muted">{group.description}</p>
                    </div>
                    <div className={cn("grid min-w-0 gap-6", group.columns.length > 1 && "sm:grid-cols-2")}>
                      {group.columns.map((column) => (
                        <section key={column.id} aria-labelledby={`${group.id}-${column.id}`}>
                          <h2 id={`${group.id}-${column.id}`} className="text-xs font-bold uppercase tracking-[0.14em] text-shell-muted">
                            {column.label}
                          </h2>
                          <ul className="mt-3 space-y-1">
                            {column.links.map((link) => (
                              <li key={link.id}>
                                <NavigationMenuLink asChild>
                                  <Link
                                    href={link.href}
                                    aria-current={pathname === link.href ? "page" : undefined}
                                    className="block min-h-11 rounded-shell-sm px-3 py-3 text-sm font-semibold text-shell-ink hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]"
                                    onClick={() => closeAndReturnFocus(group.id)}
                                  >
                                    {link.label}
                                  </Link>
                                </NavigationMenuLink>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
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
