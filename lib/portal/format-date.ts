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

function hongKongYear(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {year: 'numeric', timeZone: TIME_ZONE}).format(date);
}

// The big day/month pair on an event card. Month is short ("Jan" / "1月"). The year is added only
// when the date falls outside the current Hong Kong year: "12 Nov" for an event 13 months out was
// ambiguous (final review M6). `now` is a parameter so tests never depend on the wall clock.
export function portalDateParts(locale: AppLocale, value: string | Date, now: Date = new Date()): {day: string; month: string; year: string | null} {
  const date = toDate(value);
  return {
    day: new Intl.DateTimeFormat(INTL_LOCALE[locale], {day: 'numeric', timeZone: TIME_ZONE}).format(date),
    month: new Intl.DateTimeFormat(INTL_LOCALE[locale], {month: 'short', timeZone: TIME_ZONE}).format(date),
    year: hongKongYear(date) === hongKongYear(now) ? null : new Intl.DateTimeFormat(INTL_LOCALE[locale], {year: 'numeric', timeZone: TIME_ZONE}).format(date),
  };
}

// Stripe amounts are in the currency's minor unit (cents for HKD, whole yen for JPY); Intl knows
// each currency's exponent, so the divisor comes from it rather than a hard-coded 100.
export function formatPortalAmount(locale: AppLocale, minorUnits: number, currency: string): string | null {
  try {
    const format = new Intl.NumberFormat(INTL_LOCALE[locale], {style: 'currency', currency: currency.toUpperCase()});
    const exponent = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(minorUnits / 10 ** exponent);
  } catch {
    // An unknown currency code throws a RangeError; the caller then falls back to the plain title.
    return null;
  }
}
