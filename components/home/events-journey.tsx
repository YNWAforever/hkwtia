import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {CardGrid} from '@/components/wt/card-grid';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {eventsRepository} from '@/lib/db/repos/events';
import {formatEventDate as formatDate} from '@/lib/home/format-event-date';
import {ANONYMOUS_ACTOR} from '@/lib/membership/lifecycle';

const stageKeys = ['before', 'during', 'after'] as const;

// Section 4 of 13. app/styles/wisetech.css:227 .event-stage-grid; :232 .event-empty.
export async function EventsJourney({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.eventsJourney'});
  const events = await eventsRepository
    .listFeaturedPublic(ANONYMOUS_ACTOR, {asOf: new Date(), limit: 2, locale})
    .catch(() => []);

  return (
    <Section labelledBy="events-journey-title" id="events-journey">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="events-journey-title" variant="split" lead={t('intro')} />
      <div className="event-stage-grid">
        {stageKeys.map((stage, index) => (
          <article key={stage}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{t(`stages.${stage}.title`)}</h3>
            <p>{t(`stages.${stage}.copy`)}</p>
          </article>
        ))}
      </div>
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
        <div className="event-empty">
          <div>
            <StatusLabel>{t('statusLabel')}</StatusLabel>
            <h3>{t('emptyTitle')}</h3>
          </div>
          <ActionLink href="/events" variant="button-dark">{t('viewAllAction')}</ActionLink>
        </div>
      )}
    </Section>
  );
}
