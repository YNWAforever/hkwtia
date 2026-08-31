import type {Metadata} from "next";
import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {BuildLogDetail} from "@/components/marketing/build-log-detail";
import {NewsDetail} from "@/components/marketing/news-detail";
import type {AppLocale} from "@/i18n/routing";
import {
  getPublishedBuildLogBySlug,
  getPublishedNewsBySlug,
  parsePublishedBuildLogSlug,
  type PublishedBuildLogDetail,
  type PublishedNewsDetail,
} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string; slug: string}>};
type PublishedPost =
  | Readonly<{kind: "news"; post: PublishedNewsDetail}>
  | Readonly<{kind: "buildlog"; post: PublishedBuildLogDetail}>;

function postSlugOrNotFound(slug: string): string {
  try {
    return parsePublishedBuildLogSlug(slug);
  } catch {
    notFound();
  }
}

async function publishedPost(locale: AppLocale, slug: string): Promise<PublishedPost> {
  const parsed = postSlugOrNotFound(slug);
  const news = await getPublishedNewsBySlug(locale, parsed);
  if (news) return {kind: "news", post: news};

  const buildLog = await getPublishedBuildLogBySlug(parsed);
  if (!buildLog) notFound();
  return {kind: "buildlog", post: buildLog};
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const appLocale = locale as AppLocale;
  const resolved = await publishedPost(appLocale, slug);
  const title = resolved.kind === "news"
    ? resolved.post.title
    : appLocale === "zh-HK" ? resolved.post.titleZh : resolved.post.titleEn;
  const post = resolved.post;
  return buildPageMetadata({
    locale: appLocale,
    pathname: `/news/${post.slug}`,
    title,
    description: `${post.author} · ${new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Hong_Kong",
    }).format(post.publishedAt)}`,
  });
}

export default async function NewsPostPage({params}: Props) {
  const {locale, slug} = await params;
  const appLocale = locale as AppLocale;
  const resolved = await publishedPost(appLocale, slug);
  setRequestLocale(locale);
  return resolved.kind === "news"
    ? <NewsDetail locale={appLocale} post={resolved.post}/>
    : <BuildLogDetail locale={appLocale} post={resolved.post}/>;
}
