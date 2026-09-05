import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {BuildLogCard} from "@/components/marketing/build-log-card";
import {NewsCard} from "@/components/marketing/news-card";
import {NewsQualityPanel} from "@/components/marketing/news-quality-panel";
import {FooterNewsletter} from "@/components/layout/footer-newsletter";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedBuildLogs, listPublishedNews} from "@/lib/db/repos/public-posts";
import {toMailBody} from "@/lib/i18n/mail-body";
import {buildPageMetadata} from "@/lib/metadata";

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
  const [t, common] = await Promise.all([
    getTranslations({locale, namespace: "News"}),
    getTranslations({locale, namespace: "Common"}),
  ]);
  const appLocale = locale as AppLocale;
  // A database outage degrades to the empty state rather than a 500.
  const [news, buildLogs] = await Promise.all([
    listPublishedNews(appLocale).catch(() => []),
    listPublishedBuildLogs().catch(() => []),
  ]);

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
        {news.length > 0 || buildLogs.length > 0 ? (
          <div className="archive-grid">
            {news.map((post) => (
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
            {buildLogs.map((post) => (
              <BuildLogCard key={post.slug} locale={appLocale} post={post} statusLabel={t("statusBuildLog")}/>
            ))}
          </div>
        ) : (
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
    </>
  );
}
