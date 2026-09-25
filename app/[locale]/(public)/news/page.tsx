import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {BuildLogCard} from "@/components/marketing/build-log-card";
import {NewsCard} from "@/components/marketing/news-card";
import {NewsQualityPanel} from "@/components/marketing/news-quality-panel";
import {FooterNewsletter} from "@/components/layout/footer-newsletter";
import {StructuredData} from "@/components/seo/structured-data";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedBuildLogs, listPublishedNews} from "@/lib/db/repos/public-posts";
import {toMailBody} from "@/lib/i18n/mail-body";
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
  const [news, buildLogs] = await Promise.all([
    listPublishedNews(appLocale).catch(() => null),
    listPublishedBuildLogs().catch(() => null),
  ]);
  const unavailable = news === null || buildLogs === null;
  const availableNews = news ?? [];
  const availableBuildLogs = buildLogs ?? [];

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
        {unavailable ? <HonestEmpty variant="inner" title={t("unavailableTitle")} copy={t("unavailableDescription")} /> : null}
        {availableNews.length > 0 || availableBuildLogs.length > 0 ? (
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
            {availableBuildLogs.map((post) => (
              <BuildLogCard key={post.slug} locale={appLocale} post={post} statusLabel={t("statusBuildLog")}/>
            ))}
          </div>
        ) : unavailable ? null : (
          <HonestEmpty variant="inner" title={t("emptyTitle")} copy={t("emptyDescription")} />
        )}
        <NewsQualityPanel labels={{eyebrow: t("quality.eyebrow"), title: t("quality.title"), body: t("quality.body")}} />
      </Section>
      <div className="news-subscribe-band">
        <div className="shell">
          <FooterNewsletter labels={{
            eyebrow: t("subscribe.eyebrow"),
            title: t("subscribe.title"),
            emailLabel: t("subscribe.emailLabel"),
            placeholder: t("subscribe.placeholder"),
            submit: t("subscribe.submit"),
            success: t("subscribe.success"),
            error: t("subscribe.error"),
            mailSubject: t("subscribe.mailSubject"),
            mailBody: toMailBody(t.raw("subscribe.mailBody")),
          }} />
        </div>
      </div>
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(appLocale, "/news", tRoot))} />
    </>
  );
}
