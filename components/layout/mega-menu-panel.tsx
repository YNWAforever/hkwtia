"use client";

import {Arrow} from "@/components/wt/arrow";
import {StatusLabel} from "@/components/wt/status-label";
import type {LocalizedNavigationGroup} from "@/config/navigation";
import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type MegaMenuPanelProps = {
  group: LocalizedNavigationGroup;
  exploreLabel: string;
  viewOverviewLabel: string;
  /** Locale-stripped path from `usePathname`; drives the exact-match `aria-current`. */
  pathname: string;
  onNavigate: () => void;
};

// Donor commit f91ecc5 :423-444. Split out of DesktopMegaNavigation because Radix only mounts
// NavigationMenuContent while a menu is open, and opening one in jsdom pulls in the Viewport's
// ResizeObserver, which the test environment does not provide. Keeping the panel presentational
// lets tests/unit/public-shell.test.tsx render it directly for all four groups.
export function MegaMenuPanel({
  group,
  exploreLabel,
  viewOverviewLabel,
  pathname,
  onNavigate,
}: MegaMenuPanelProps) {
  return (
    <div className={cn("mega-menu-v2", group.eventFirst && "mega-event")}>
      <div className="mega-menu-main">
        <div className="mega-menu-heading">
          <div>
            <span>{exploreLabel}</span>
            <strong>{group.label}</strong>
          </div>
          <Link href={group.landingHref} onClick={onNavigate}>
            {viewOverviewLabel}
            <Arrow />
          </Link>
        </div>
        <div className="mega-columns">
          {group.columns.map((column) => {
            // The donor's columns are bare divs, so a screen reader reads their links as one
            // undifferentiated list. Naming each column from its own title restores the
            // grouping without touching the markup the port styles: .mega-column stays a div
            // and .mega-column-title stays a <p>, both only gaining attributes.
            const titleId = `${group.id}-${column.id}-title`;
            return (
              <div className="mega-column" key={column.id} role="group" aria-labelledby={titleId}>
                <p className="mega-column-title" id={titleId}>{column.label}</p>
                {column.links.map((link) => (
                  <Link
                    key={link.id}
                    href={link.href}
                    aria-current={pathname === link.href ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {link.label}
                    <Arrow />
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <aside className="mega-feature-v2">
        <StatusLabel>{group.feature.label}</StatusLabel>
        <strong className="mega-feature-title">{group.feature.title}</strong>
        <p>{group.feature.copy}</p>
        <Link href={group.feature.href} onClick={onNavigate}>
          {group.feature.cta}
          <Arrow />
        </Link>
      </aside>
    </div>
  );
}
