'use client';

import {useSearchParams} from 'next/navigation';
import {Suspense} from 'react';

import type {AppLocale} from '@/i18n/routing';
import {usePathname, useRouter} from '@/i18n/navigation';

type LocaleSwitcherProps = {
  locale: AppLocale;
  englishLabel: string;
  chineseLabel: string;
  switchToEnglishLabel: string;
  switchToChineseLabel: string;
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
  switchToChineseLabel
}: LocaleSwitcherProps) {
  const targetLocale: AppLocale = locale === 'en' ? 'zh-HK' : 'en';

  return <LocaleSwitcherButton
    accessibleLabel={targetLocale === 'en' ? switchToEnglishLabel : switchToChineseLabel}
    label={targetLocale === 'en' ? englishLabel : chineseLabel}
  />;
}

function LocaleSwitcherContent({
  locale,
  englishLabel,
  chineseLabel,
  switchToEnglishLabel,
  switchToChineseLabel
}: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetLocale: AppLocale = locale === 'en' ? 'zh-HK' : 'en';
  const label = targetLocale === 'en' ? englishLabel : chineseLabel;
  const accessibleLabel = targetLocale === 'en' ? switchToEnglishLabel : switchToChineseLabel;
  const search = searchParams.toString();
  const href = search ? `${pathname}?${search}` : pathname;

  return <LocaleSwitcherButton
    accessibleLabel={accessibleLabel}
    label={label}
    onClick={() => router.replace(href, {locale: targetLocale})}
  />;
}

function LocaleSwitcherButton({
  accessibleLabel,
  label,
  onClick
}: {
  accessibleLabel: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-full border border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={accessibleLabel}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
