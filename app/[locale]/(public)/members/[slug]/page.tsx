import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {StructuredData} from "@/components/seo/structured-data";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import {industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import {companyProfilesRepository} from "@/lib/db/repos/company-profiles";
import {formatEventDate} from "@/lib/home/format-event-date";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import {localeText} from "@/lib/members/public";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {brandedTitle, buildPageMetadata} from "@/lib/metadata";
import {buildBreadcrumbData, buildMemberOrganizationData} from "@/lib/structured-data";
import {absoluteUrl, localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string; slug: string}>}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale: localeValue, slug} = await params;
  const locale = localeValue as AppLocale;
  const t = await getTranslations({locale, namespace: "Members"});
  const profile = await companyProfilesRepository.getPublishedBySlug(slug).catch(() => null);
  if (!profile) {
    // Unknown, unpublished or malformed slug: the page 404s, but the metadata still renders, so
    // it reads the directory's own branded pair rather than naming a company we will not show.
    return buildPageMetadata({locale, pathname: `/members/${slug}`, title: t("metaTitle"), description: t("metaDescription")});
  }
  return buildPageMetadata({
    locale,
    pathname: `/members/${profile.slug}`,
    title: brandedTitle(locale, profile.name),
    description: localeText(profile.tagline, locale) ?? localeText(profile.description, locale) ?? t("metaDescription"),
  });
}

export default async function MemberDetailPage({params}: Props) {
  const {locale: localeValue, slug} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // No `.catch(() => null)` here: a miss must 404, and a database outage must stay a 500 rather
  // than telling a member their reviewed page does not exist.
  const profile = await companyProfilesRepository.getPublishedBySlug(slug);
  if (!profile) notFound();
  const [t, tCommon] = await Promise.all([
    getTranslations({locale, namespace: "Members"}),
    getTranslations({locale, namespace: "Common"}),
  ]);
  const tagline = localeText(profile.tagline, locale);
  const description = localeText(profile.description, locale);
  const planLabel = profile.plan === null ? null : t(`plans.${profile.plan satisfies MembershipPlanCode}`);
  const memberPath = `/members/${profile.slug}`;

  return <>
    <PageHero
      breadcrumb={{homeHref: "/members", homeLabel: t("breadcrumbCurrent"), current: profile.name}}
      breadcrumbLabel={tCommon("breadcrumbLabel")}
      eyebrow={t("eyebrow")}
      lead={tagline ?? description ?? t("description")}
      title={profile.name}
      variant="inner"
    />
    <Section labelledBy="member-profile-title">
      <h2 className="sr-only" id="member-profile-title">{profile.name}</h2>
      {profile.logoUrl ? (
        <div className="partner-record-logo">
          <Image alt={profile.name} height={202} src={profile.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(profile.logoUrl)} width={320} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {planLabel ? <span className="partner-status">{planLabel}</span> : null}
        {profile.tags.map((tag) => <span className="partner-status" key={tag}>{industryTagLabel(tag, locale)}</span>)}
      </div>
      {description ? <p>{description}</p> : null}
      <dl>
        {profile.website ? (
          <div>
            <dt>{t("detail.website")}</dt>
            {/* `profile.website` is already through `canonicalHttpsUrl` in the repository, on the
                read as well as the write; `rel` still travels with the anchor. */}
            <dd><a href={profile.website} rel="noopener noreferrer" target="_blank">{profile.website}</a></dd>
          </div>
        ) : null}
        {profile.showcase ? (
          <div>
            <dt>{t("detail.showcase")}</dt>
            <dd><Link className="text-link" href={localizedPath(locale, `/showcase/${profile.showcase.slug}`)}>{profile.showcase.name}</Link></dd>
          </div>
        ) : null}
      </dl>
    </Section>
    <Section labelledBy="member-events-title" tone="bright">
      <h2 id="member-events-title">{t("detail.events")}</h2>
      {profile.events.length > 0 ? (
        <ul>
          {profile.events.map((event) => (
            <li key={event.slug}>
              <Link className="text-link" href={localizedPath(locale, `/events/${event.slug}`)}>
                {localeText({en: event.titleEn, zhHk: event.titleZh}, locale) ?? event.titleEn}
              </Link>
              <span>{formatEventDate(event.startsAt, locale)}</span>
            </li>
          ))}
        </ul>
      ) : <p>{t("detail.noEvents")}</p>}
    </Section>
    <StructuredData data={buildMemberOrganizationData({
      name: profile.name,
      slug: profile.slug,
      website: profile.website,
      logoUrl: profile.logoUrl,
      description,
    }, locale)} />
    <StructuredData data={buildBreadcrumbData([
      {name: tCommon("breadcrumbHome"), url: absoluteUrl(localizedPath(locale, "/"))},
      {name: t("breadcrumbCurrent"), url: absoluteUrl(localizedPath(locale, "/members"))},
      {name: profile.name, url: absoluteUrl(localizedPath(locale, memberPath))},
    ])} />
  </>;
}
