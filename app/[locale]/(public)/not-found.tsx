import {getTranslations} from 'next-intl/server';

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
  // Locale-independent by design: Next.js renders a route group's not-found.tsx outside the
  // normal params flow, so there is no {locale} to read here the way every other page in this
  // programme does. English is deliberately correct for readers who fell out of any locale
  // path (the same "no locale segment" caveat the root file's own not-found.tsx already lives
  // with); a locale-aware Concierge or nav link the reader clicks from here still lands them on
  // a fully localized page.
  const t = await getTranslations({locale: 'en', namespace: 'NotFound'});

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
