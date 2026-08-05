import type {EventRecord} from '@/content/schemas';

import {PageHero} from '@/components/marketing/page-hero';

type EventDetailProps = {
  record: EventRecord;
  title: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-HK', {
  dateStyle: 'long',
  timeZone: 'Asia/Hong_Kong'
});

export function EventDetail({record, title}: EventDetailProps) {
  const startDate = dateFormatter.format(new Date(record.startsAt));
  const timing = record.endsAt
    ? `${startDate} – ${dateFormatter.format(new Date(record.endsAt))}`
    : startDate;

  return <PageHero eyebrow="" title={title} description={`${record.venue} · ${timing}`} image={record.image} imageAlt="" />;
}
