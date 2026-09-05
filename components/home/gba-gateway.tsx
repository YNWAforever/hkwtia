import {getTranslations} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {RouteMap} from '@/components/wt/route-map';
import type {AppLocale} from '@/i18n/routing';
import {cohortRepository} from '@/lib/db/repos/cohorts';
import {ANONYMOUS_ACTOR} from '@/lib/membership/lifecycle';

// Section 9 of 13. cohortRepository.listPublicCohorts already filters to
// PUBLIC_COHORT_STATUSES (open, active); the CTA label distinguishes a literally open
// cohort from the general "come explore" state. The read degrades to an empty list on
// rejection so this public section never 500s. app/styles/wisetech.css:253 .gba-section;
// :254 .gba-copy; :255-257 .gba-map/.hk-node/.gz-node/.sz-node/.world-node. No
// `.gba-section a`/`.gba-copy a` rule overrides link styling here (only the generic
// `.hero-actions .button` sizing rules apply), so ActionLink's plain "button button-light"
// output is exactly what the donor CSS expects.
export async function GbaGateway({locale}: Readonly<{locale: AppLocale}>) {
  const t = await getTranslations({locale, namespace: 'Home.gbaGateway'});
  const cohorts = await cohortRepository.listPublicCohorts(ANONYMOUS_ACTOR).catch(() => []);
  const hasOpenCohort = cohorts.some((cohort) => cohort.status === 'open');

  return (
    <section className="gba-section" aria-labelledby="gba-gateway-title">
      <RouteMap variant="hero" labels={{hk: 'HK', gz: 'GZ', sz: 'SZ', world: '↗'}} />
      <div className="shell gba-copy">
        <p className="eyebrow light">{t('eyebrow')}</p>
        <h2 id="gba-gateway-title">{t('title')}</h2>
        <p>{t('copy')}</p>
        <div className="hero-actions">
          <ActionLink variant="button-light" href="/launchpad">
            {hasOpenCohort ? t('openCohortAction') : t('exploreAction')}
          </ActionLink>
        </div>
      </div>
    </section>
  );
}
