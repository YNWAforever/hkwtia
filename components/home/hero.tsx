import {getTranslations} from 'next-intl/server';
import Image from 'next/image';

import {assertOwnOriginEditorialImage} from '@/components/marketing/institutional-page-intro';
import {ActionLink} from '@/components/wt/action-link';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

// The donor's own hero photograph (WiseTechSite.tsx:477), ported on the owner's 2026-09-07
// instruction and byte-pinned by tests/unit/wisetech-asset-provenance.test.ts via the
// integration manifest's `photos` provenance. It replaced the /images/projects-hero.jpg
// placeholder that stood in until the donor photography was cleared for use.
const HERO_IMAGE = '/archive/tech-connect-ai-leaders.webp';

// Donor top-spanning scrim (design doc §2, closes E-47): app/styles/wisetech.css:92 .hero;
// :93 .hero-image/.hero-scrim/.network-field; :99 .hero-content; :102 .hero-actions;
// :103 .hero-note; :104 .hero-scroll.
export async function Hero({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.hero'});
  const image = assertOwnOriginEditorialImage(HERO_IMAGE);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <Image alt={t('imageAlt')} className="hero-image" fill priority sizes="100vw" src={image} />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="network-field" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <div className="hero-content shell">
        <p className="eyebrow light">{t('eyebrow')}</p>
        <h1 id="hero-title">{t('title')}</h1>
        <p>{t('lead')}</p>
        <div className="hero-actions">
          <ActionLink href="/events?status=open" variant="button">{t('actions.findEvent')}</ActionLink>
          <ActionLink href="/join" variant="text-link-light">{t('actions.join')}</ActionLink>
          <ActionLink href="/showcase" variant="text-link-light">{t('actions.members')}</ActionLink>
        </div>
      </div>
      <div className="hero-note">{t('note')}</div>
      <Link className="hero-scroll" href="#home-discover">
        <span aria-hidden="true" />
        {t('discover')}
      </Link>
    </section>
  );
}
