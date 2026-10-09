import type {Metadata} from 'next';
import Image from 'next/image';
import {getTranslations, setRequestLocale} from 'next-intl/server';

import {StructuredData} from '@/components/seo/structured-data';
import {ActionLink} from '@/components/wt/action-link';
import {Eyebrow} from '@/components/wt/eyebrow';
import {HonestEmpty} from '@/components/wt/honest-empty';
import {PageHero} from '@/components/wt/page-hero';
import {Section} from '@/components/wt/section';
import type {AppLocale} from '@/i18n/routing';
import {partnersRepository, type PartnerProjection} from '@/lib/db/repos/partners';
import {isPrivateMediaDeliveryUrl} from '@/lib/media/url';
import {buildPageMetadata} from '@/lib/metadata';
import {groupPublishedPartners} from '@/lib/partners/public-groups';
import {routeBreadcrumbItems} from '@/lib/seo/route-breadcrumbs';
import {buildBreadcrumbData} from '@/lib/structured-data';

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
  const [t, common, tRoot, partners] = await Promise.all([
    getTranslations({locale, namespace: 'Partners'}),
    getTranslations({locale, namespace: 'Common'}),
    // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.partners`).
    getTranslations({locale}),
    // 100 is the repository's hard maximum: past 100 published records the count would understate
    // and rows would be dropped silently. A follow-up pages the list or raises the cap.
    partnersRepository.listPublished(locale, {limit: 100}).catch((): readonly PartnerProjection[] => []),
  ]);
  const groups = groupPublishedPartners(partners);

  return (
    <>
      <PageHero
        className="defer-following-sections"
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
                  <div className="partner-record-summary">
                    <p>{t('group.count', {count: group.partners.length})}</p>
                    {/* Said once for the group: every record in it shares this relationship and
                        WTIA's confirmation. Repeated on each of 79 cards it made /partners
                        30,016px tall on phones (round 18). */}
                    <p>{t(`record.relationshipCopy.${group.category}`)} {t('record.confirmed')}</p>
                  </div>
                </div>
                <div className="partner-record-grid partner-tile-grid">
                  {group.partners.map((partner) => {
                    // Only a recorded start or end year is particular to one partner; a plain
                    // "Confirmed by WTIA" is already said under the group heading.
                    const start = year(partner.relationshipStartsOn);
                    const end = year(partner.relationshipEndsOn);
                    const years = start && end ? t('record.tileWindow', {start, end}) : start ? t('record.tileSince', {year: start}) : null;
                    return (
                      <article className="partner-record-card partner-tile" key={partner.id}>
                        <div className="partner-record-logo">
                          {partner.logoUrl && partner.logoAlt ? (
                            <Image alt={partner.logoAlt} height={202} src={partner.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(partner.logoUrl)} width={320} />
                          ) : null}
                        </div>
                        <div className="partner-record-body">
                          <h3>{partner.name}</h3>
                          {years ? <p className="partner-tile-meta">{years}</p> : null}
                          {partner.websiteUrl ? (
                            <a className="partner-tile-link" href={partner.websiteUrl} rel="noreferrer">
                              {partner.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
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
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale, '/partners', tRoot))} />
    </>
  );
}
