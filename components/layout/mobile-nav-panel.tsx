"use client";

import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle} from "@/components/ui/sheet";
import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {Arrow} from "@/components/wt/arrow";
import type {LocalizedNavigationGroup, NavigationViewModel} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

type MobileNavPanelProps = {
  locale: AppLocale;
  navigation: NavigationViewModel;
  labels: {
    open: string;
    close: string;
    title: string;
    description: string;
    priority: string;
    utilities: string;
    exploreEcosystem: string;
    search: string;
    viewOverview: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
  brand: {homeLabel: string; publicName: string; descriptor: string; logoAlt: string};
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expandedGroup: string;
  onExpandedGroupChange: (value: string) => void;
};

/**
 * The donor's own mobile link builder (commit f91ecc5 :358-363) flattens a group's columns and
 * slices to five, where the donor's fifth entry is always its own "View All …" leaf. hkwtia's
 * groups carry no such leaf, so the slice keeps the first five and the group landing route is
 * appended as the view-all. The events group's sixth and seventh leaves (/programs/tct and
 * /programs/cpai) and the About group's sixth leaf (/partners) are therefore cut from this list.
 * The programme leaves are reached from the desktop mega menu, the footer, and /programmes;
 * /partners is reached from the desktop mega menu, the footer's About column and the home page's
 * partner wall "view all" links (components/home/legacy-network.tsx) — matching
 * config/navigation.ts and recorded as errata E-19 / E-79.
 */
function mobileLinksFor(group: LocalizedNavigationGroup, viewOverviewLabel: string) {
  const leaves = group.columns.flatMap((column) => column.links).slice(0, 5);
  return [
    ...leaves,
    {id: `${group.id}-overview`, href: group.landingHref, label: viewOverviewLabel},
  ];
}

// Radix Dialog and Accordion stay out of the first-load graph. Weekly Lighthouse
// run 40850403806 spent the /events first paint blocked on shared client JS, and
// this panel is closed until the reader asks for it. The trigger lives in
// mobile-navigation.tsx so the header button is in the server HTML.
export function MobileNavPanel({
  locale,
  navigation,
  labels,
  brand,
  open,
  onOpenChange,
  expandedGroup,
  onExpandedGroupChange,
}: MobileNavPanelProps) {
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="full" className="mobile-menu">
        {/* Radix Dialog requires a title; the donor names its dialog with aria-label instead,
            so the heading is visually hidden and still supplies the accessible name. */}
        <SheetTitle className="sr-only">{labels.title}</SheetTitle>
        <SheetDescription className="sr-only">{labels.description}</SheetDescription>

        <div className="mobile-menu-top">
          <DualBrandLockup labels={brand} />
          <SheetClose asChild>
            <button type="button" aria-label={labels.close}>
              <span aria-hidden="true">×</span>
            </button>
          </SheetClose>
        </div>

        <nav className="mobile-priority-actions" aria-label={labels.priority} data-testid="mobile-priority-actions">
          <SheetClose asChild>
            <Link className="mobile-event-action" href={navigation.actions.findEvent.href} prefetch={false}>
              {navigation.actions.findEvent.label}
              <Arrow />
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={navigation.actions.join.href} prefetch={false}>
              {navigation.actions.join.label}
              <Arrow />
            </Link>
          </SheetClose>
        </nav>

        <nav className="mobile-utilities" aria-label={labels.utilities}>
          <SheetClose asChild>
            <Link href="/showcase" prefetch={false}>{labels.search}</Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={navigation.memberPortal.href} prefetch={false}>{navigation.memberPortal.label}</Link>
          </SheetClose>
          {/* Not a SheetClose: switching locale is a router.replace, not a Link navigation, so
              the dialog has to be closed by hand. Removing this wrapper silently breaks
              close-after-locale-switch, which tests/unit/mobile-navigation.test.tsx pins. */}
          <div className="[&_button]:min-w-11" onClick={() => onOpenChange(false)}>
            <LocaleSwitcher
              locale={locale}
              englishLabel={labels.english}
              chineseLabel={labels.chinese}
              switchToEnglishLabel={labels.switchToEnglish}
              switchToChineseLabel={labels.switchToChinese}
            />
          </div>
        </nav>

        <p className="eyebrow">{labels.exploreEcosystem}</p>

        <div className="mobile-accordions">
          <Accordion type="single" collapsible value={expandedGroup} onValueChange={onExpandedGroupChange}>
            {navigation.groups.map((group) => {
              const current = group.columns.some((column) => column.links.some(({href}) =>
                pathname === href || pathname.startsWith(`${href}/`),
              ));
              const links = mobileLinksFor(group, labels.viewOverview);
              return (
                <AccordionItem
                  key={group.id}
                  value={group.id}
                  className={cn("mobile-accordion", group.eventFirst && "event-first")}
                >
                  <AccordionTrigger
                    data-current={current ? "true" : undefined}
                    marker={<span aria-hidden="true">{expandedGroup === group.id ? "−" : "+"}</span>}
                  >
                    {group.label}
                  </AccordionTrigger>
                  <AccordionContent className="mobile-accordion-panel">
                    {links.map((link, index) => (
                      <SheetClose asChild key={link.id}>
                        <Link
                          className={index === links.length - 1 ? "mobile-view-all" : undefined}
                          href={link.href}
                          prefetch={false}
                          aria-current={pathname === link.href ? "page" : undefined}
                        >
                          {link.label}
                          <Arrow />
                        </Link>
                      </SheetClose>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
