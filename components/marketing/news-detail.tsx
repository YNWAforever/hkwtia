import type {NewsPostRecord} from '@/content/schemas';

import {PageHero} from '@/components/marketing/page-hero';

type NewsDetailProps = {
  record: NewsPostRecord;
  title: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-HK', {
  dateStyle: 'long',
  timeZone: 'Asia/Hong_Kong'
});

export function NewsDetail({record, title}: NewsDetailProps) {
  const date = dateFormatter.format(new Date(record.publishedAt));

  return <PageHero eyebrow="" title={title} description={date} image={record.image} imageAlt="" />;
}
