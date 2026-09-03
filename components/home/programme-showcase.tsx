import {getTranslations} from 'next-intl/server';

import {Arrow} from '@/components/wt/arrow';
import {CardIndex} from '@/components/wt/card-index';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import {Link} from '@/i18n/navigation';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';

// Section 8 of 13. app/styles/wisetech.css:216 .programme-grid; :217 .programme-card;
// :219 .programme-card.feature. A plain <Link> is used for the final CTA rather than
// ActionLink: app/styles/wisetech.css:225 `.programme-card>a` styles a bare child anchor
// directly (border-top, its own flex layout) and defines no `.text-link`/`.button` rule for
// this container, so ActionLink's variant class would be an unwanted addition here.
export async function ProgrammeShowcase({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.programmeShowcase'});
  const summaries = summarizeProgrammes();

  return (
    <Section labelledBy="programme-showcase-title" id="programmes">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="programme-showcase-title" variant="split" lead={t('intro')} />
      <div className="programme-grid">
        {summaries.map((programme, index) => (
          <article className={index === 0 ? 'programme-card feature' : 'programme-card'} key={programme.id}>
            <div>
              <StatusLabel>{programme.type === 'credential' ? t('credentialLabel') : t('eventSeriesLabel')}</StatusLabel>
              <CardIndex index={index + 1} />
            </div>
            <h3>{t(`items.${programme.id}.name`)}</h3>
            <p>{t(`items.${programme.id}.description`)}</p>
            <small>
              {programme.type === 'credential'
                ? t('credentialFact')
                : t('editionsFact', {count: programme.editionCount ?? 0, year: programme.latestYear ?? ''})}
            </small>
            <Link href={`/programs/${programme.id}`}>{t('action')} <Arrow /></Link>
          </article>
        ))}
      </div>
    </Section>
  );
}
