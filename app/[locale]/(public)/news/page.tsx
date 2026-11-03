import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {NewsCard} from "@/components/marketing/news-card";
import {NewsQualityPanel} from "@/components/marketing/news-quality-panel";
import {StructuredData} from "@/components/seo/structured-data";
import {HonestDirectoryEmpty} from "@/components/wt/honest-directory-empty";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedNews} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "News"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/news",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function NewsPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  const [t, common, tRoot] = await Promise.all([
    getTranslations({locale, namespace: "News"}),
    getTranslations({locale, namespace: "Common"}),
    // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.*`).
    getTranslations({locale}),
  ]);
  const appLocale = locale as AppLocale;
  // Each feed can fail independently. Keep available posts and name an outage honestly.
  const news = await listPublishedNews(appLocale).catch(() => null);
  const unavailable = news === null;
  const availableNews = news ?? [];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("description")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <Section tone="paper">
        {/* Without it the outline jumped h1 -> h3 (the card or empty-state title). */}
        <h2 className="sr-only">{t("resultsHeading")}</h2>
        {unavailable ? <HonestEmpty variant="inner" title={t("unavailableTitle")} copy={t("unavailableDescription")} /> : null}
        {availableNews.length > 0 ? (
          <div className="archive-grid">
            {availableNews.map((post) => (
              <NewsCard
                author={post.author}
                key={post.slug}
                locale={appLocale}
                publishedAt={post.publishedAt}
                slug={post.slug}
                statusLabel={t("statusNews")}
                title={post.title}
              />
            ))}
          </div>
        ) : unavailable ? null : (
          <HonestDirectoryEmpty
            next={t("emptyDescription")}
            primary={{href: "/", label: t("emptyPrimary")}}
            secondary={{href: "/contact", label: t("emptySecondary")}}
            status={t("emptyTitle")}
          />
        )}
        <NewsQualityPanel labels={{eyebrow: t("quality.eyebrow"), title: t("quality.title"), body: t("quality.body")}} />
      </Section>
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(appLocale, "/news", tRoot))} />
    </>
  );
}
