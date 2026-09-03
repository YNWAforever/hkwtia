import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Section} from '@/components/wt/section';
import {SectionHeading} from '@/components/wt/section-heading';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';

// Section 6 of 13. No data owner exists for outcome stories today (D-8) -- this section is
// always the honest publishing-framework state, never a fabricated case.
// app/styles/wisetech.css:247 .outcome-template; :249 .outcome-visual.
export async function Outcomes({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.outcomes'});

  return (
    <Section labelledBy="outcomes-title" id="outcomes">
      <SectionHeading eyebrow={t('eyebrow')} title={t('title')} headingId="outcomes-title" variant="split" lead={t('intro')} />
      <div className="outcome-template">
        <div className="outcome-visual">
          <span>{t('frameworkLabel')}</span>
          <b>{t('frameworkSteps')}</b>
        </div>
        <div>
          <StatusLabel>{t('statusLabel')}</StatusLabel>
          <h3>{t('emptyTitle')}</h3>
          <p>{t('emptyCopy')}</p>
          <ActionLink href="/contact" variant="text-link">{t('action')}</ActionLink>
        </div>
      </div>
    </Section>
  );
}
