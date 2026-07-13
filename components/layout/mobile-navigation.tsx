'use client';

import {Menu} from 'lucide-react';
import {useRef, useState} from 'react';

import {LocaleSwitcher} from '@/components/layout/locale-switcher';
import {Button} from '@/components/ui/button';
import {Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger} from '@/components/ui/sheet';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

type MobileNavigationProps = {
  locale: AppLocale;
  items: ReadonlyArray<{href: string; label: string}>;
  labels: {
    open: string;
    close: string;
    title: string;
    description: string;
    join: string;
    english: string;
    chinese: string;
    switchToEnglish: string;
    switchToChinese: string;
  };
};

export function MobileNavigation({locale, items, labels}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button ref={triggerRef} variant="ghost" size="icon" className="md:hidden" aria-label={labels.open}>
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={labels.close}>
        <SheetTitle>{labels.title}</SheetTitle>
        <SheetDescription>{labels.description}</SheetDescription>
        <nav className="mt-8" aria-label={labels.title}>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.href}>
                <SheetClose asChild>
                  <Link className="block border-b border-border/60 py-3 font-medium" href={item.href}>
                    {item.label}
                  </Link>
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 flex items-center gap-3">
          <Button asChild className="rounded-full">
            <Link href="/membership">{labels.join}</Link>
          </Button>
          <LocaleSwitcher
            locale={locale}
            englishLabel={labels.english}
            chineseLabel={labels.chinese}
            switchToEnglishLabel={labels.switchToEnglish}
            switchToChineseLabel={labels.switchToChinese}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
