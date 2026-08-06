import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {BuildLogCard} from "@/components/marketing/build-log-card";
import {EmptyState} from "@/components/marketing/empty-state";
import {NewsCard} from "@/components/marketing/news-card";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedBuildLogs, listPublishedNews} from "@/lib/db/repos/public-posts";
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
  const t = await getTranslations({locale, namespace: "News"});
  const appLocale = locale as AppLocale;
  // A database outage degrades to the empty state rather than a 500.
  const [news, buildLogs] = await Promise.all([
    listPublishedNews().catch(() => []),
    listPublishedBuildLogs().catch(() => []),
  ]);

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <section className="container mx-auto px-6 py-16">
        {news.length > 0 || buildLogs.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {news.map((post) => (
              <NewsCard
                author={post.author}
                key={post.slug}
                locale={appLocale}
                publishedAt={post.publishedAt}
                slug={post.slug}
                title={appLocale === "zh-HK" ? post.titleZh : post.titleEn}
              />
            ))}
            {buildLogs.map((post) => (
              <BuildLogCard key={post.slug} locale={appLocale} post={post}/>
            ))}
          </div>
        ) : (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        )}
      </section>
    </>
  );
}
