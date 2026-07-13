'use client';

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
  locale,
  englishLabel,
  chineseLabel,
  switchToEnglishLabel,
  switchToChineseLabel
}: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();
  const targetLocale: AppLocale = locale === 'en' ? 'zh-HK' : 'en';
  const label = targetLocale === 'en' ? englishLabel : chineseLabel;
  const accessibleLabel = targetLocale === 'en' ? switchToEnglishLabel : switchToChineseLabel;

  return (
    <button
      type="button"
      className="rounded-full border border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={accessibleLabel}
      onClick={() => router.replace(pathname, {locale: targetLocale})}
    >
      {label}
    </button>
  );
}
