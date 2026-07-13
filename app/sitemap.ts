import type {MetadataRoute} from 'next';

import {publicRoutes} from '@/config/public-routes';
import {events} from '@/content/events';
import {newsPosts} from '@/content/news';
import type {AppLocale} from '@/i18n/routing';
import {absoluteUrl, localizedPath} from '@/lib/urls';

const locales: AppLocale[] = ['en', 'zh-HK'];

function alternates(pathname: string) {
  return {
    languages: {
      en: absoluteUrl(localizedPath('en', pathname)),
      'zh-HK': absoluteUrl(localizedPath('zh-HK', pathname)),
    },
  };
}

function localizedEntries(pathname: string): MetadataRoute.Sitemap {
  const languages = alternates(pathname);
  return locales.map((locale) => ({
    url: absoluteUrl(localizedPath(locale, pathname)),
    alternates: languages,
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = publicRoutes.flatMap((pathname) => localizedEntries(pathname));
  const eventEntries = events.flatMap((record) => localizedEntries(`/events/${record.slug}`));
  const newsEntries = newsPosts.flatMap((record) => localizedEntries(`/news/${record.slug}`));

  return [...staticEntries, ...eventEntries, ...newsEntries];
}
