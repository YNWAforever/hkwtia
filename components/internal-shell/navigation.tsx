"use client";

import {useState, type ReactNode} from "react";
import Link from "next/link";

import {Sheet, SheetContent, SheetTrigger} from "@/components/ui/sheet";

export type InternalNavLink = Readonly<{id: string; href: string; label: string}>;
export type InternalNavGroup = Readonly<{id: string; label?: string; links: readonly InternalNavLink[]}>;
export type InternalNavigationLabels = Readonly<{navigationLabel: string; openMenu: string; closeMenu: string}>;

const linkClassName =
  "flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground";

/**
 * Find the single longest-matching href for the current path.
 * Among all hrefs that are either exactly equal to currentPath OR a genuine path-prefix of it,
 * returns the longest one (most specific). Returns undefined if no match exists.
 * This ensures exactly one link gets aria-current="page" even with nested routes.
 */
function findCurrentLink(groups: readonly InternalNavGroup[], currentPath: string): string | undefined {
  const allHrefs = groups.flatMap((group) => group.links.map((link) => link.href));
  const matchingHrefs = allHrefs.filter((href) => href === currentPath || currentPath.startsWith(`${href}/`));

  if (matchingHrefs.length === 0) return undefined;

  // Return the longest matching href (most specific)
  return matchingHrefs.reduce((longest, current) => (current.length > longest.length ? current : longest));
}

function NavLinks({groups, currentPath, onNavigate}: {groups: readonly InternalNavGroup[]; currentPath: string; onNavigate?: () => void}) {
  const currentLink = findCurrentLink(groups, currentPath);

  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="space-y-1">
          {group.label ? <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
          {group.links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={linkClassName}
              aria-current={link.href === currentLink ? "page" : undefined}
              onClick={onNavigate}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function InternalNavigation({
  groups,
  labels,
  currentPath,
  children,
}: Readonly<{groups: readonly InternalNavGroup[]; labels: InternalNavigationLabels; currentPath: string; children?: ReactNode}>) {
  const [open, setOpen] = useState(false);

  return (
    <nav aria-label={labels.navigationLabel} className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="hidden flex-1 items-center gap-1 md:flex">
          <NavLinks groups={groups} currentPath={currentPath} />
        </div>
        <div className="hidden md:block">{children}</div>
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" className="min-h-11 min-w-11 rounded-md border px-3 py-2 text-sm font-medium">
                {labels.openMenu}
              </button>
            </SheetTrigger>
            <SheetContent aria-label={labels.navigationLabel} side="left">
              <div className="flex flex-col gap-1 pt-6">
                <NavLinks groups={groups} currentPath={currentPath} onNavigate={() => setOpen(false)} />
                <div className="mt-4 border-t pt-4">{children}</div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
