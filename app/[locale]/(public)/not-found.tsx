import {getLocale, getTranslations} from 'next-intl/server';

import {PageHero} from '@/components/wt/page-hero';

/**
 * Decision 4: app/[locale]/not-found.tsx (the root-level file, unchanged by this task) is
 * wrapped only by app/[locale]/layout.tsx -- no SiteHeader, SiteFooter, ConciergeWidget, and
 * neither wisetech.css nor wisetech-shell.css, all four mounted exclusively by
 * app/[locale]/(public)/layout.tsx. This route-group-scoped not-found.tsx is what every real
 * dead link inside the public site actually renders from now on; the root file remains as the
 * bare fallback for a request whose [locale] segment itself doesn't resolve at all, where no
 * shell could be mounted regardless (there is no locale to render SiteHeader's nav in).
 */
export default async function PublicNotFound() {
  // Next.js doesn't pass {params} to a route-group not-found.tsx, but the locale is still
  // knowable: this file only renders after [locale] has already matched (a real dead sub-route,
  // e.g. /zh/some-missing-page) -- unlike the root not-found.tsx above, which is the fallback for
  // when [locale] itself fails to match. `getLocale()` reads it from the same request-scoped
  // source i18n/request.ts's `requestLocale` does: proxy.ts's next-intl middleware stamps every
  // matched request with an `x-next-intl-locale` header (see
  // node_modules/next-intl/dist/.../RequestLocale.js), and `getLocale()`/`getTranslations()` read
  // that header via `next/headers` -- a per-request mechanism, not a props one, so it survives
  // regardless of which segment or special file is rendering. Verified with a real dev-server
  // request to a dead /zh/... sub-route (see the commit message for the transcript).
  const locale = await getLocale();
  const t = await getTranslations({locale, namespace: 'NotFound'});

  return (
    <PageHero
      variant="inner"
      eyebrow={t('eyebrow')}
      title={t('title')}
      lead={t('description')}
      actions={[
        {href: '/', label: t('homeAction')},
        {href: '/events', label: t('eventsAction')},
      ]}
    />
  );
}
