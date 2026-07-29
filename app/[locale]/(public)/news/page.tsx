import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {BuildLogCard} from "@/components/marketing/build-log-card";
import {EmptyState} from "@/components/marketing/empty-state";
import {PageHero} from "@/components/marketing/page-hero";
import {newsPosts} from "@/content/news";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedBuildLogs} from "@/lib/db/repos/public-posts";
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
  const buildLogs = await listPublishedBuildLogs();
  const appLocale = locale as AppLocale;

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <section className="container mx-auto px-6 py-16">
        {newsPosts.length > 0 || buildLogs.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {newsPosts.map((post) => <p key={post.slug}>{post.slug}</p>)}
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
