"use client";

import {Menu} from "lucide-react";
import {useRef, useState} from "react";

import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Button} from "@/components/ui/button";
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger} from "@/components/ui/sheet";
import type {NavigationViewModel} from "@/config/navigation";
import {Link, usePathname} from "@/i18n/navigation";
import type {AppLocale} from "@/i18n/routing";

type MobileNavigationProps = {
  locale: AppLocale;
  navigation: NavigationViewModel;
  labels: {
    open: string;
    close: string;
    title: string;
    description: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
};

export function MobileNavigation({locale, navigation, labels}: MobileNavigationProps) {
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
        <Button ref={triggerRef} variant="ghost" size="icon" className="min-h-11 min-w-11 lg:hidden" aria-label={labels.open}>
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        closeLabel={labels.close}
        className="overflow-y-auto bg-shell-raised text-shell-ink [&_button]:min-h-11 [&>button]:min-w-11"
      >
        <SheetTitle>{labels.title}</SheetTitle>
        <SheetDescription>{labels.description}</SheetDescription>

        <div className="mt-6 grid grid-cols-2 gap-3" data-testid="mobile-priority-actions">
          {[navigation.actions.findEvent, navigation.actions.join].map((action) => (
            <SheetClose asChild key={action.id}>
              <Link
                href={action.href}
                className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-full bg-shell-blue px-3 text-center text-sm font-bold text-white break-words first:bg-shell-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]"
              >
                {action.label}
              </Link>
            </SheetClose>
          ))}
        </div>

        <nav className="mt-6" aria-label={labels.title}>
          <Accordion type="single" collapsible value={expandedGroup} onValueChange={setExpandedGroup}>
            {navigation.groups.map((group) => {
              const current = group.columns.some((column) => column.links.some(({href}) =>
                pathname === href || pathname.startsWith(`${href}/`),
              ));
              return (
                <AccordionItem key={group.id} value={group.id}>
                  <AccordionTrigger data-current={current ? "true" : undefined}>{group.label}</AccordionTrigger>
                  <AccordionContent>
                    {group.columns.map((column) => (
                      <section key={column.id} className="mt-3 min-w-0" aria-labelledby={`mobile-${group.id}-${column.id}`}>
                        <h2 id={`mobile-${group.id}-${column.id}`} className="break-words text-xs font-bold uppercase tracking-[0.14em] text-shell-muted">
                          {column.label}
                        </h2>
                        <ul className="mt-2 space-y-1">
                          {column.links.map((link) => (
                            <li key={link.id}>
                              <SheetClose asChild>
                                <Link
                                  href={link.href}
                                  aria-current={pathname === link.href ? "page" : undefined}
                                  className="block min-h-11 min-w-0 break-words rounded-shell-sm px-3 py-3 font-medium hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]"
                                >
                                  {link.label}
                                </Link>
                              </SheetClose>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </nav>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-shell-border pt-6">
          <SheetClose asChild>
            <Link className="inline-flex min-h-11 min-w-11 items-center break-words rounded-full px-3 text-sm font-semibold hover:bg-shell-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--shell-focus))]" href={navigation.memberPortal.href}>
              {navigation.memberPortal.label}
            </Link>
          </SheetClose>
          <div className="[&_button]:min-w-11" onClick={() => handleOpenChange(false)}>
            <LocaleSwitcher
              locale={locale}
              englishLabel={labels.english}
              chineseLabel={labels.chinese}
              switchToEnglishLabel={labels.switchToEnglish}
              switchToChineseLabel={labels.switchToChinese}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
