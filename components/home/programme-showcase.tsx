import {getTranslations} from 'next-intl/server';

import {ProgrammeGrid} from '@/components/marketing/programme-grid';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import type {AppLocale} from '@/i18n/routing';
import {summarizeProgrammes} from '@/lib/home/programme-summaries';

// Section 8 of 13. The grid itself lives in components/marketing/programme-grid.tsx since WP-7,
// shared with /programmes.
export async function ProgrammeShowcase({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.programmeShowcase'});
  const summaries = summarizeProgrammes();

  return (
    <Section labelledBy="programme-showcase-title" id="programmes">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="programme-showcase-title" variant="split" lead={t('intro')} />
      <ProgrammeGrid
        summaries={summaries}
        labels={{
          eventSeriesLabel: t('eventSeriesLabel'),
          credentialLabel: t('credentialLabel'),
          credentialFact: t('credentialFact'),
          editionsFact: (count, year) => t('editionsFact', {count, year}),
          action: t('action'),
          items: {
            cpai: {name: t('items.cpai.name'), description: t('items.cpai.description')},
            hkict: {name: t('items.hkict.name'), description: t('items.hkict.description')},
            tct: {name: t('items.tct.name'), description: t('items.tct.description')},
            asa: {name: t('items.asa.name'), description: t('items.asa.description')},
          },
        }}
      />
    </Section>
  );
}
