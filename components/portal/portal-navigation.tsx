"use client";

import {usePathname} from "next/navigation";
import {useId, useState} from "react";

import {findCurrentLink, type InternalNavGroup} from "@/components/internal-shell/navigation";
import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {Sheet, SheetContent, SheetTrigger} from "@/components/ui/sheet";

export type PortalNavGroup = InternalNavGroup & Readonly<{label: string}>;
export type PortalNavigationLabels = Readonly<{navigationLabel: string; openMenu: string; closeMenu: string}>;

function GroupList({groups, currentHref, onNavigate}: Readonly<{groups: readonly PortalNavGroup[]; currentHref: string | undefined; onNavigate?: () => void}>) {
  // The desktop column and the phone sheet render the same groups, so the label ids need a
  // per-instance prefix or the two aria-labelledby targets would collide.
  const prefix = useId();
  return (
    <>
      {groups.map((group) => {
        const labelId = `${prefix}-${group.id}`;
        return (
          <div key={group.id} className="portal-nav-group">
            <p id={labelId} className="portal-nav-group-label">{group.label}</p>
            <ul aria-labelledby={labelId}>
              {group.links.map((link) => (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    className="portal-nav-link"
                    aria-current={link.href === currentHref ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/**
 * The member portal's section navigation: a sticky column from 1121px up, a Menu sheet below.
 * Hrefs arrive already localised (so the pathname from next/navigation matches them), and
 * `findCurrentLink` picks the single most specific match so /portal/company/seats does not
 * also light up Company.
 */
export function PortalNavigation({groups, labels}: Readonly<{groups: readonly PortalNavGroup[]; labels: PortalNavigationLabels}>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const currentHref = findCurrentLink(groups, pathname);

  return (
    <nav aria-label={labels.navigationLabel} className="portal-nav">
      <div className="portal-nav-column">
        <GroupList groups={groups} currentHref={currentHref} />
      </div>
      <div className="portal-nav-menu">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" className="portal-nav-menu-button">{labels.openMenu}</button>
          </SheetTrigger>
          <SheetContent aria-label={labels.navigationLabel} side="left" closeLabel={labels.closeMenu}>
            <div className="portal-nav-sheet">
              <GroupList groups={groups} currentHref={currentHref} onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
