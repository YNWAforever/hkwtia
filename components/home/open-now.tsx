import {getTranslations} from 'next-intl/server';

import {CardGrid} from '@/components/wt/card-grid';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {eventsRepository} from '@/lib/db/repos/events';
import {formatEventDate as formatDate} from '@/lib/home/format-event-date';
import {ANONYMOUS_ACTOR} from '@/lib/membership/lifecycle';

// Section 2 of 13. #home-discover is the pre-existing scroll anchor (E-52); this is the
// first section below the hero, so the anchor moved here from the old highlights grid.
// app/styles/wisetech.css:184 .opportunity-section; :764 .open-now-actions.
export async function OpenNow({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.openNow'});
  const events = await eventsRepository
    .listPublic(ANONYMOUS_ACTOR, {status: 'open', asOf: new Date(), locale, limit: 3})
    .catch(() => []);

  return (
    <Section id="home-discover" tone="ink" labelledBy="open-now-title">
      <SectionHeading
        eyebrow={t('eyebrow')}
        title={t('title')}
        headingId="open-now-title"
        variant="split"
        lead={t('intro')}
        inverse
      />
      {events.length > 0 ? (
        <CardGrid
          variant="service"
          items={events.map((event) => ({
            title: event.title,
            copy: event.venue ? `${formatDate(event.startsAt, locale)} · ${event.venue}` : formatDate(event.startsAt, locale),
            href: `/events/${event.slug}`,
          }))}
        />
      ) : (
        <HonestEmpty
          label={t('statusLabel')}
          title={t('empty.title')}
          copy={t('empty.copy')}
          actions={[
            {label: t('updatesAction'), href: '/events?status=open'},
            {label: t('challengeAction'), href: '/contact'},
          ]}
        />
      )}
    </Section>
  );
}
