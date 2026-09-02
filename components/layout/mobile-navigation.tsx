"use client";

import {useRef, useState} from "react";

import {DualBrandLockup} from "@/components/layout/dual-brand-lockup";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger} from "@/components/ui/sheet";
import {Arrow} from "@/components/wt/arrow";
import type {LocalizedNavigationGroup, NavigationViewModel} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";
import {cn} from "@/lib/utils";

type MobileNavigationProps = {
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
};

/**
 * The donor's own mobile link builder (commit f91ecc5 :358-363) flattens a group's columns and
 * slices to five, where the donor's fifth entry is always its own "View All …" leaf. hkwtia's
 * groups carry no such leaf, so the slice keeps the first five and the group landing route is
 * appended as the view-all. The events group's sixth leaf (/programs/cpai) is therefore reached
 * from the desktop mega menu and the footer, not this list — recorded as errata E-19.
 */
function mobileLinksFor(group: LocalizedNavigationGroup, viewOverviewLabel: string) {
  const leaves = group.columns.flatMap((column) => column.links).slice(0, 5);
  return [
    ...leaves,
    {id: `${group.id}-overview`, href: group.landingHref, label: viewOverviewLabel},
  ];
}

// Donor commit f91ecc5 :446-469 — top bar, priority actions, utilities, the eyebrow and the
// accordions. Radix Dialog supplies the focus trap, Escape close and scroll lock the donor
// writes by hand.
export function MobileNavigation({locale, navigation, labels, brand}: MobileNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setExpandedGroup("");
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <button ref={triggerRef} type="button" className="mobile-trigger" aria-label={labels.open}>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </SheetTrigger>
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
            <Link className="mobile-event-action" href={navigation.actions.findEvent.href}>
              {navigation.actions.findEvent.label}
              <Arrow />
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={navigation.actions.join.href}>
              {navigation.actions.join.label}
              <Arrow />
            </Link>
          </SheetClose>
        </nav>

        <nav className="mobile-utilities" aria-label={labels.utilities}>
          <SheetClose asChild>
            <Link href="/showcase">{labels.search}</Link>
          </SheetClose>
          <SheetClose asChild>
            <Link href={navigation.memberPortal.href}>{navigation.memberPortal.label}</Link>
          </SheetClose>
          {/* Not a SheetClose: switching locale is a router.replace, not a Link navigation, so
              the dialog has to be closed by hand. Removing this wrapper silently breaks
              close-after-locale-switch, which tests/unit/mobile-navigation.test.tsx pins. */}
          <div className="[&_button]:min-w-11" onClick={() => handleOpenChange(false)}>
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
          <Accordion type="single" collapsible value={expandedGroup} onValueChange={setExpandedGroup}>
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
