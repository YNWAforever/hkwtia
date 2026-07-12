import type {AppLocale} from '@/i18n/routing';

export function localizedPath(locale: AppLocale, path: string): string {
  if (locale === 'en') return path;
  return path === '/' ? '/zh' : `/zh${path}`;
}

export function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return new URL(path, base).toString();
}
