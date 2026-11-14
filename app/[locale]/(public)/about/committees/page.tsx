import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {StructuredData} from "@/components/seo/structured-data";
import {ExcoRoster} from "@/components/wt/exco-roster";
import {excoRoster} from "@/content/exco-roster";
import {PageHero} from "@/components/wt/page-hero";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {buildPageMetadata} from "@/lib/metadata";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Committees"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/about/committees",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function CommitteesPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Committees");
  const common = await getTranslations({locale, namespace: "Common"});
  // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.*`).
  const tRoot = await getTranslations({locale});
  // 2026–2028 Executive Committee. Order is Willy Lai, then surname, then given name.
  // Wording is Committees.roster in both message bundles. zhPending on
  // content/exco-roster.ts is true only for Donald Chan and Jimmy Chan.
  // Innovation and membership copy stays off this page; those committees were not supplied.
  // t.raw skips ICU parsing so a biography apostrophe stays verbatim.
  const text = (key: string) => t.raw(key) as string;
  const members = excoRoster.map((member) => ({
    slug: member.slug,
    name: text(`roster.${member.slug}.name`),
    wtiaRole: member.wtiaRole ? text(`roster.${member.slug}.wtiaRole`) : null,
    title: member.title ? text(`roster.${member.slug}.title`) : null,
    organization: member.organization ? text(`roster.${member.slug}.organization`) : null,
    paragraphs: member.bio ? text(`roster.${member.slug}.bio`).split("\n\n") : [],
    pendingBiography: member.bio ? null : text("emptyBiography"),
    linkedIn: member.linkedIn ? {href: text(`roster.${member.slug}.linkedIn`), label: text("linkedInLabel")} : null,
    photo: member.photo,
    photoPosition: member.photoPosition,
  }));
  const related = await buildOtherAboutRoutes(locale as AppLocale, "committees");

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("summary")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("eyebrow")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <Section labelledBy="exco-roster-title">
        <SectionHeading eyebrow={t("eyebrow")} headingId="exco-roster-title" title={t("executive.title")} />
        <ExcoRoster members={members} />
      </Section>
      <RichRelatedRoutes items={related} />
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale as AppLocale, "/about/committees", tRoot))} />
    </>
  );
}
