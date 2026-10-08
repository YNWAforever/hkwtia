import type {AppLocale} from '@/i18n/routing';

// Hong Kong has no DST, so a fixed zone is exact. Formatting in the viewer's zone would show an
// event that starts at 01:00 HKT on the previous day to a member browsing from the UK.
const TIME_ZONE = 'Asia/Hong_Kong';
// Bare "en" resolves to US ordering ("November 12, 2026"); the site is Hong Kong English.
const INTL_LOCALE: Record<AppLocale, string> = {en: 'en-GB', 'zh-HK': 'zh-HK'};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatPortalDate(locale: AppLocale, value: string | Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE}).format(toDate(value));
}

// The big day/month pair on an event card. Month is short ("Jan" / "1月").
export function portalDateParts(locale: AppLocale, value: string | Date): {day: string; month: string} {
  const date = toDate(value);
  return {
    day: new Intl.DateTimeFormat(INTL_LOCALE[locale], {day: 'numeric', timeZone: TIME_ZONE}).format(date),
    month: new Intl.DateTimeFormat(INTL_LOCALE[locale], {month: 'short', timeZone: TIME_ZONE}).format(date),
  };
}
