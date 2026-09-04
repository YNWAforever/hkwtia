import type {AppLocale} from '@/i18n/routing';

// Single home for the `dateStyle: 'long'` / `timeZone: 'Asia/Hong_Kong'` formatting that used to
// be copy-pasted across components/home/open-now.tsx, components/home/events-journey.tsx (both
// taking a string `value`) and components/home/impact-evidence.tsx (taking a `Date` and closing
// over `locale`). `value` accepts either shape here -- `new Date(value)` is a no-op when `value`
// is already a `Date` -- so every call site can share one implementation without reshaping its
// own data first.
export function formatEventDate(value: string | Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {dateStyle: 'long', timeZone: 'Asia/Hong_Kong'}).format(new Date(value));
}
