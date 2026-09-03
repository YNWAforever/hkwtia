import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {CardIndex} from '@/components/wt/card-index';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';

// D-7: SME is an audience pathway card, not a fifth plan. Hrefs are hkwtia's canonical
// destinations (master table row 3), not the donor's unported routes.
// corporates and professionals intentionally share /membership (D-7): both are membership
// pathways on the same catalog page, not separate destinations.
const items = [
  {key: 'corporates', href: '/membership', accent: 'cyan'},
  {key: 'smes', href: '/events', accent: 'jade'},
  {key: 'startups', href: '/showcase', accent: 'amber'},
  {key: 'professionals', href: '/membership', accent: 'blue'},
  {key: 'gba', href: '/launchpad', accent: 'violet'},
] as const;

// Section 3 of 13. app/styles/wisetech.css:137 .audience-grid; :138 .audience-card;
// :148 .benefit-line.
export async function Pathways({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.pathways'});

  return (
    <Section labelledBy="pathways-title" id="pathways">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="pathways-title" variant="split" lead={t('intro')} />
      <div className="audience-grid">
        {items.map((item, index) => (
          <Link key={item.key} className={`audience-card accent-${item.accent}`} href={item.href}>
            <CardIndex index={index + 1} />
            <h3>{t(`items.${item.key}.title`)}</h3>
            <p>{t(`items.${item.key}.copy`)}</p>
            <span className="benefit-line">{t(`items.${item.key}.benefits`)}</span>
            <b>{t(`items.${item.key}.cta`)} <Arrow /></b>
          </Link>
        ))}
      </div>
    </Section>
  );
}
