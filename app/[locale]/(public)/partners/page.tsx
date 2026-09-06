import type {Metadata} from 'next';
import Image from 'next/image';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {ActionLink} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import {StatusLabel} from '@/components/wt/status-label';
import type {AppLocale} from '@/i18n/routing';
import {partnersRepository, type PartnerProjection} from '@/lib/db/repos/partners';
import {isPrivateMediaDeliveryUrl} from '@/lib/media/url';
import {buildPageMetadata} from '@/lib/metadata';
import {groupPublishedPartners} from '@/lib/partners/public-groups';

export const dynamic = 'force-dynamic';

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: 'Partners'});
  return buildPageMetadata({locale: locale as AppLocale, pathname: '/partners', title: t('metaTitle'), description: t('metaDescription')});
}

function year(date: string | null): string | null {
  return date ? date.slice(0, 4) : null;
}

// The manifest had retired /partners while no verified partner authority existed
// (route-design-partners), until WP-7 supplied this page. PR4/WP-5 created the authority:
// listPublished returns only rows with both confirmations, bilingual logo alt text and a current
// window, so every record printed here is "confirmed" by construction -- the donor's "historical
// listing, unconfirmed" copy and its hard-coded 79 are not ported. Donor grammar:
// app/styles/wisetech.css:789-813.
export default async function PartnersPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, common, partners] = await Promise.all([
    getTranslations({locale, namespace: 'Partners'}),
    getTranslations({locale, namespace: 'Common'}),
    // 100 is the repository's hard maximum: past 100 published records the count would understate
    // and rows would be dropped silently. A follow-up pages the list or raises the cap.
    partnersRepository.listPublished(locale, {limit: 100}).catch((): readonly PartnerProjection[] => []),
  ]);
  const groups = groupPublishedPartners(partners);

  const status = (partner: PartnerProjection): string => {
    const start = year(partner.relationshipStartsOn);
    const end = year(partner.relationshipEndsOn);
    if (start && end) return t('record.window', {start, end});
    if (start) return t('record.since', {year: start});
    return t('record.confirmed');
  };

  return (
    <>
      <PageHero
        eyebrow={t('hero.eyebrow')}
        title={t('hero.title')}
        lead={t('hero.lead')}
        breadcrumb={{homeHref: '/', homeLabel: common('breadcrumbHome'), current: t('hero.breadcrumbCurrent')}}
        breadcrumbLabel={common('breadcrumbLabel')}
      />
      <Section className="partner-directory-page" labelledBy="partners-source-title">
        <div className="partner-source-note">
          <div>
            <Eyebrow>{t('sourceNote.eyebrow')}</Eyebrow>
            <h2 id="partners-source-title">{t('sourceNote.title')}</h2>
          </div>
          <div>
            <p>{t('sourceNote.copy')}</p>
            <p>{t('sourceNote.count', {count: partners.length})}</p>
          </div>
        </div>
        {groups.length === 0 ? (
          <HonestEmpty variant="inner" label={t('empty.label')} title={t('empty.title')} copy={t('empty.copy')} actions={[{href: '/contact', label: t('empty.action')}]} />
        ) : (
          <>
            {/* Same-page anchors: a bare <a> like /programmes' groupings nav, since a hash needs
                no locale prefix and `.partner-category-nav a` styles the bare child anchor. */}
            <nav className="partner-category-nav" aria-label={t('categories.label')}>
              {groups.map((group) => (
                <a href={`#partners-${group.category}`} key={group.category}>
                  <span>{t(`categories.${group.category}`)}</span>
                  <b>{group.partners.length}</b>
                </a>
              ))}
            </nav>
            {groups.map((group) => (
              <section className="partner-record-group" id={`partners-${group.category}`} key={group.category} aria-labelledby={`partners-${group.category}-title`}>
                <div className="partner-record-heading">
                  <div>
                    <Eyebrow>{t('group.eyebrow')}</Eyebrow>
                    <h2 id={`partners-${group.category}-title`}>{t(`categories.${group.category}`)}</h2>
                  </div>
                  <p>{t('group.count', {count: group.partners.length})}</p>
                </div>
                <div className="partner-record-grid">
                  {group.partners.map((partner) => (
                    <article className="partner-record-card" key={partner.id}>
                      <div className="partner-record-logo">
                        {partner.logoUrl && partner.logoAlt ? (
                          <Image alt={partner.logoAlt} height={202} src={partner.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(partner.logoUrl)} width={320} />
                        ) : null}
                      </div>
                      <div className="partner-record-body">
                        <StatusLabel as="span" className="partner-status">{t('record.badge')}</StatusLabel>
                        <h3>{partner.name}</h3>
                        <dl>
                          <div>
                            <dt>{t('record.relationship')}</dt>
                            <dd>{t(`record.relationshipCopy.${partner.category}`)}</dd>
                          </div>
                          {partner.websiteUrl ? (
                            <div>
                              <dt>{t('record.website')}</dt>
                              <dd>
                                <a href={partner.websiteUrl} rel="noreferrer">{partner.websiteUrl.replace(/^https?:\/\//, '')}</a>
                              </dd>
                            </div>
                          ) : null}
                          <div>
                            <dt>{t('record.status')}</dt>
                            <dd>{status(partner)}</dd>
                          </div>
                        </dl>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
        <div className="partner-confirmation">
          <div>
            <Eyebrow light>{t('update.eyebrow')}</Eyebrow>
            <h2>{t('update.title')}</h2>
            <p>{t('update.copy')}</p>
          </div>
          <ActionLink href="/contact" variant="button-light">{t('update.action')}</ActionLink>
        </div>
      </Section>
    </>
  );
}
