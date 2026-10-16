import type {AppLocale} from '@/i18n/routing';

// A member's own event carries both titles; the zh-HK portal once showed titleEn on every card even
// when the member had entered a Chinese title (final review I3). The Chinese title is optional on
// the form, so a blank one falls back to English rather than rendering an empty heading.
export function localizedEventTitle(locale: AppLocale, event: Readonly<{titleEn: string; titleZh?: string | null}>): string {
  const zh = event.titleZh?.trim();
  return locale === 'zh-HK' && zh ? zh : event.titleEn;
}
