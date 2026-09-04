import {getTranslations} from 'next-intl/server';

import type {AppLocale} from '@/i18n/routing';

export type AboutRouteKey = 'about' | 'history' | 'chairman' | 'committees';

export type AboutRelatedRoute = Readonly<{href: string; label: string; title: string; description: string}>;

type AboutRouteRecord = Readonly<{key: AboutRouteKey; href: string; namespace: string; descriptionKey: 'summary' | 'intro'}>;

// Route identity only. Every string rendered for a route is read from that route's own,
// already-shipped namespace -- never authored fresh here. History alone calls its lead
// paragraph `intro` (see History.intro in messages/en.json); About/Chairman/Committees all
// use `summary`.
const routes: readonly AboutRouteRecord[] = [
  {key: 'about', href: '/about', namespace: 'About', descriptionKey: 'summary'},
  {key: 'history', href: '/about/history', namespace: 'History', descriptionKey: 'intro'},
  {key: 'chairman', href: '/about/chairman', namespace: 'Chairman', descriptionKey: 'summary'},
  {key: 'committees', href: '/about/committees', namespace: 'Committees', descriptionKey: 'summary'},
];

export function otherAboutRoutes(current: AboutRouteKey): readonly AboutRouteRecord[] {
  return routes.filter((route) => route.key !== current);
}

export async function buildOtherAboutRoutes(locale: AppLocale, current: AboutRouteKey): Promise<readonly AboutRelatedRoute[]> {
  return Promise.all(
    otherAboutRoutes(current).map(async (route) => {
      const t = await getTranslations({locale, namespace: route.namespace});
      return {href: route.href, label: t('eyebrow'), title: t('title'), description: t(route.descriptionKey)};
    }),
  );
}
