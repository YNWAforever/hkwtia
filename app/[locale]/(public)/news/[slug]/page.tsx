import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {NewsDetail} from "@/components/marketing/news-detail";
import {StructuredData} from "@/components/seo/structured-data";
import type {AppLocale} from "@/i18n/routing";
import {
  getPublishedNewsBySlug,
  parsePublishedBuildLogSlug,
  type PublishedNewsDetail,
} from "@/lib/db/repos/public-posts";
import {brandedTitle, buildPageMetadata} from "@/lib/metadata";
import {ogImagePath} from "@/lib/og/resolve-renderer";
import {buildArticleData} from "@/lib/structured-data";

export const dynamic = "force-dynamic";

const EXCERPT_MAX = 160;

// `posts` has no summary column, so Article.description is derived from the post's own
// opening prose rather than invented. Headings are skipped because a news body opens with
// an "## ..." section heading, and inline markdown is stripped so the description reads as
// plain text to a crawler.
function articleExcerpt(body: string): string {
  const firstLine = body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#")) ?? "";
  const plain = firstLine
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
  return plain.length > EXCERPT_MAX ? `${plain.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : plain;
}


type Props = {params: Promise<{locale: string; slug: string}>};
function postSlugOrNotFound(slug: string): string {
  try {
    return parsePublishedBuildLogSlug(slug);
  } catch {
    notFound();
  }
}

async function publishedNews(locale: AppLocale, slug: string): Promise<PublishedNewsDetail> {
  const parsed = postSlugOrNotFound(slug);
  const news = await getPublishedNewsBySlug(locale, parsed);
  // Build logs are engineering notes. They are not public news. R3, 2026-11-03.
  if (!news) notFound();
  return news;
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const appLocale = locale as AppLocale;
  const post = await publishedNews(appLocale, slug);
  const title = post.title;
  const t = await getTranslations({locale, namespace: "News"});
  return buildPageMetadata({
    locale: appLocale,
    pathname: `/news/${post.slug}`,
    title: brandedTitle(appLocale, title),
    description: `${post.author} · ${new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Hong_Kong",
    }).format(post.publishedAt)}`,
    // Build logs share this route and are editorial too, so both post kinds get the
    // editorial card (neither carries an image column).
    image: ogImagePath({kind: "news", title, eyebrow: t("eyebrow"), imageUrl: null}),
  });
}

export default async function NewsPostPage({params}: Props) {
  const {locale, slug} = await params;
  const appLocale = locale as AppLocale;
  const post = await publishedNews(appLocale, slug);
  setRequestLocale(locale);
  return (
    <>
      <NewsDetail locale={appLocale} post={post}/>
      <StructuredData data={buildArticleData({
        slug: post.slug,
        title: post.title,
        description: articleExcerpt(post.body),
        publishedAt: post.publishedAt,
        // The repository does not select posts.updated_at; a post that was never edited is
        // unmodified rather than undated, which buildArticleData already handles.
        updatedAt: null,
        author: post.author,
      }, appLocale)} />
    </>
  );
}
