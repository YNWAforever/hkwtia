'use client';

import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';

import type {AppLocale} from '@/i18n/routing';
import {usePathname, useRouter} from '@/i18n/navigation';
import {cn} from '@/lib/utils';

type LocaleSwitcherProps = {
  locale: AppLocale;
  englishLabel: string;
  chineseLabel: string;
  switchToEnglishLabel: string;
  switchToChineseLabel: string;
  /** The header passes the donor's `language-link`; the mobile menu and footer pass nothing. */
  className?: string;
};

export function LocaleSwitcher({
  ...props
}: LocaleSwitcherProps) {
  return (
    <Suspense fallback={<LocaleSwitcherFallback {...props} />}>
      <LocaleSwitcherContent {...props} />
    </Suspense>
  );
}

function LocaleSwitcherFallback({
  locale,
  englishLabel,
  chineseLabel,
  switchToEnglishLabel,
  switchToChineseLabel,
  className
}: LocaleSwitcherProps) {
  const targetLocale: AppLocale = locale === 'en' ? 'zh-HK' : 'en';

  return <LocaleSwitcherButton
    accessibleLabel={targetLocale === 'en' ? switchToEnglishLabel : switchToChineseLabel}
    label={targetLocale === 'en' ? englishLabel : chineseLabel}
    className={className}
  />;
}

function LocaleSwitcherContent({
  locale,
  englishLabel,
  chineseLabel,
  switchToEnglishLabel,
  switchToChineseLabel,
  className
}: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetLocale: AppLocale = locale === 'en' ? 'zh-HK' : 'en';
  const label = targetLocale === 'en' ? englishLabel : chineseLabel;
  const accessibleLabel = targetLocale === 'en' ? switchToEnglishLabel : switchToChineseLabel;
  const search = searchParams.toString();

  function switchLocale() {
    const query = search ? `?${search}` : '';
    const fragment = window.location.hash;
    router.replace(`${pathname}${query}${fragment}`, {locale: targetLocale});
  }

  return <LocaleSwitcherButton
    accessibleLabel={accessibleLabel}
    label={label}
    onClick={switchLocale}
    className={className}
  />;
}

function LocaleSwitcherButton({
  accessibleLabel,
  label,
  onClick,
  className
}: {
  accessibleLabel: string;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      // Every utility is kept, not just the box ones: the mobile menu and the footer render
      // this button with no donor class, and its `focus-visible` ring is the only visible
      // focus indicator spec §2 item 9 requires. `twMerge` lets `language-link` add donor
      // type on top rather than replace them.
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={accessibleLabel}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
