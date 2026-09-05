import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {MediaGallery} from "@/components/marketing/media-gallery";
import {PageHero} from "@/components/wt/page-hero";
import {RichCompass} from "@/components/wt/rich-compass";
import {RichRelatedRoutes} from "@/components/wt/rich-related-routes";
import {Section} from "@/components/wt/section";
import {SectionHeading} from "@/components/wt/section-heading";
import {milestones} from "@/content/milestones";
import type {MilestoneRecord} from "@/content/schemas";
import type {AppLocale} from "@/i18n/routing";
import {buildOtherAboutRoutes} from "@/lib/about/related-routes";
import {featuredOnly, findBySlug, historyCompassFacts, milestonesOnly} from "@/lib/history/milestones";
import {buildPageMetadata} from "@/lib/metadata";

type Props = {params: Promise<{locale: string; slug: string}>};

export function generateStaticParams() {
  return featuredOnly(milestonesOnly(milestones)).map(({slug}) => ({slug}));
}

function resolveFeaturedMilestone(slug: string): MilestoneRecord | null {
  const milestone = findBySlug(milestones, slug);
  return milestone && milestone.kind === "milestone" && milestone.featured ? milestone : null;
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const milestone = resolveFeaturedMilestone(slug);
  if (!milestone) return {};

  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: `/about/history/${slug}`,
    title: locale === "zh-HK" ? milestone.titleZh : milestone.titleEn,
    description: (locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn).slice(0, 160),
  });
}

// No `dynamic` export: like /about/history, this reads typed content bundled at build time.
export default async function HistoryDetailPage({params}: Props) {
  const {locale, slug} = await params;
  const milestone = resolveFeaturedMilestone(slug);
  if (!milestone) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("History");
  const common = await getTranslations({locale, namespace: "Common"});
  // Decision 1: identical hero/compass treatment to the list page, so the same real facts.
  // historyCompassFacts filters to milestonesOnly internally -- no need to pre-filter here.
  const facts = historyCompassFacts(milestones);
  const related = await buildOtherAboutRoutes(locale as AppLocale, "history");

  const title = locale === "zh-HK" ? milestone.titleZh : milestone.titleEn;
  const body = locale === "zh-HK" ? milestone.bodyZh : milestone.bodyEn;
  const paragraphs = body.split("\n\n");
  const images = milestone.images.map((image) => ({
    alt: locale === "zh-HK" ? image.altZh : image.altEn,
    src: image.src,
  }));

  return (
    <>
      <PageHero
        className="rich-page-hero"
        eyebrow={String(milestone.year)}
        title={title}
        lead={paragraphs[0] ?? body}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: title}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <RichCompass
        items={[
          {label: t("compass.foundedLabel"), value: t("compass.foundedValue", {year: facts.foundingYear})},
          {label: t("compass.milestonesLabel"), value: t("compass.milestonesValue", {count: facts.milestoneCount})},
          {label: t("compass.latestLabel"), value: t("compass.latestValue", {year: facts.latestYear})},
        ]}
      />
      <Section labelledBy="history-story-title">
        <SectionHeading eyebrow={t("eyebrow")} title={t("storyTitle")} headingId="history-story-title" variant="stacked" />
        <div className="max-w-3xl space-y-6 text-lg leading-relaxed text-muted-foreground">
          {paragraphs.slice(1).map((paragraph, index) => (
            // Paragraphs belong to one frozen content record and never reorder.
            <p key={index}>{paragraph}</p>
          ))}
        </div>
        {images.length > 0 ? (
          <div className="mt-12">
            <MediaGallery images={images} />
          </div>
        ) : null}
      </Section>
      <RichRelatedRoutes items={related} />
    </>
  );
}
