import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {BuildLogDetail} from "@/components/marketing/build-log-detail";
import {NewsDetail} from "@/components/marketing/news-detail";
import {newsPosts} from "@/content/news";
import type {AppLocale} from "@/i18n/routing";
import {
  getPublishedBuildLogBySlug,
  parsePublishedBuildLogSlug,
} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string; slug: string}>};

export function generateStaticParams() {
  return newsPosts.map(({slug}) => ({slug}));
}

function buildLogSlugOrNotFound(slug: string): string {
  try {
    return parsePublishedBuildLogSlug(slug);
  } catch {
    notFound();
  }
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const staticRecord = newsPosts.find((item) => item.slug === slug);
  if (staticRecord) {
    const t = await getTranslations({
      locale,
      namespace: staticRecord.namespace,
    });
    return buildPageMetadata({
      locale: locale as AppLocale,
      pathname: `/news/${staticRecord.slug}`,
      title: t("title"),
      description: t("description"),
      image: staticRecord.image,
    });
  }

  const buildLog = await getPublishedBuildLogBySlug(
    buildLogSlugOrNotFound(slug),
  );
  if (!buildLog) notFound();
  const title = locale === "zh-HK" ? buildLog.titleZh : buildLog.titleEn;
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: `/news/${buildLog.slug}`,
    title,
    description: `${buildLog.author} · ${new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Hong_Kong",
    }).format(buildLog.publishedAt)}`,
  });
}

export default async function NewsPostPage({params}: Props) {
  const {locale, slug} = await params;
  const staticRecord = newsPosts.find((item) => item.slug === slug);
  if (staticRecord) {
    setRequestLocale(locale);
    const t = await getTranslations({
      locale,
      namespace: staticRecord.namespace,
    });
    return <NewsDetail record={staticRecord} title={t("title")}/>;
  }

  const buildLog = await getPublishedBuildLogBySlug(
    buildLogSlugOrNotFound(slug),
  );
  if (!buildLog) notFound();
  setRequestLocale(locale);
  return <BuildLogDetail locale={locale as AppLocale} post={buildLog}/>;
}
