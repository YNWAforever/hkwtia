import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {NewsArchiveBody} from "@/components/marketing/news-archive-body";
import {NewsDetail} from "@/components/marketing/news-detail";
import {StructuredData} from "@/components/seo/structured-data";
import {PageHero} from "@/components/wt/page-hero";
import type {AppLocale} from "@/i18n/routing";
import {
  getPublishedNewsBySlug,
  parsePublishedBuildLogSlug,
  type PublishedNewsDetail,
} from "@/lib/db/repos/public-posts";
import {archiveBySlug} from "@/lib/news/archive-catalog";
import {archiveNotice, titleLangForLocale, type ArchiveArticle} from "@/lib/news/archive-document";
import {localizedPath} from "@/lib/urls";
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

async function publishedNews(locale: AppLocale, slug: string): Promise<{cms: PublishedNewsDetail} | {archive: ArchiveArticle}> {
  const parsed = postSlugOrNotFound(slug);
  let news: PublishedNewsDetail | null = null;
  let databaseFailed = false;
  try {
    news = await getPublishedNewsBySlug(locale, parsed);
  } catch {
    databaseFailed = true;
  }
  if (news) return {cms: news};
  const archive = archiveBySlug(parsed);
  if (archive && archive.extractionStatus !== "failed") return {archive};
  // A database outage must not become a 404 for a slug the archive does not own.
  if (databaseFailed) throw new Error("NEWS_UNAVAILABLE");
  notFound();
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const appLocale = locale as AppLocale;
  const loaded = await publishedNews(appLocale, slug);
  const post = "cms" in loaded ? loaded.cms : loaded.archive;
  const title = post.title;
  const publishedAt = post.publishedAt instanceof Date ? post.publishedAt : new Date(post.publishedAt);
  const t = await getTranslations({locale, namespace: "News"});
  return buildPageMetadata({
    locale: appLocale,
    pathname: `/news/${post.slug}`,
    title: brandedTitle(appLocale, title),
    description: `${post.author} · ${new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "Asia/Hong_Kong",
    }).format(publishedAt)}`,
    // Build logs share this route and are editorial too, so both post kinds get the
    // editorial card (neither carries an image column).
    image: ogImagePath({kind: "news", title, eyebrow: t("eyebrow"), imageUrl: null, locale: appLocale}),
  });
}

export default async function NewsPostPage({params}: Props) {
  const {locale, slug} = await params;
  const appLocale = locale as AppLocale;
  const loaded = await publishedNews(appLocale, slug);
  setRequestLocale(locale);
  if ("cms" in loaded) {
    const post = loaded.cms;
    return (
      <>
        <NewsDetail locale={appLocale} post={post}/>
        <StructuredData data={buildArticleData({
          slug: post.slug,
          title: post.title,
          description: articleExcerpt(post.body),
          publishedAt: post.publishedAt,
          updatedAt: null,
          author: post.author,
        }, appLocale)} />
      </>
    );
  }
  const article = loaded.archive;
  const tNotice = await getTranslations({locale, namespace: "News"});
  const publishedAt = new Date(article.publishedAt);
  const notice = archiveNotice(appLocale, article.sourceLanguages);
  const noticeKey = notice === "fallback-zh" ? "archiveFallbackZh" : notice === "fallback-en" ? "archiveFallbackEn" : "archiveOriginal";
  const inLanguage = article.sourceLanguages.length === 1
    ? (article.sourceLanguages[0] === "zh-Hant" ? "zh-HK" : "en-HK")
    : undefined;
  return (
    <>
      <PageHero
        eyebrow={article.author}
        lead={new Intl.DateTimeFormat(locale, {dateStyle: "long", timeStyle: "short", timeZone: "Asia/Hong_Kong"}).format(publishedAt)}
        title={article.title}
        titleLang={titleLangForLocale(article.title, appLocale)}
      />
      <section className="section">
        <div className="shell news-archive">
          <p className="news-archive-notice" role="note">{tNotice(noticeKey)}</p>
          <p><a href={localizedPath(appLocale, "/news")}>{tNotice("backToList")}</a></p>
          <NewsArchiveBody
            blocks={article.blocks}
            labels={{
              externalHint: tNotice("externalHint"),
              missingFile: tNotice("missingFile"),
              missingPhoto: tNotice("missingPhoto"),
              photoAlt: tNotice("photoAlt"),
            }}
          />
        </div>
      </section>
      <StructuredData data={buildArticleData({
        slug: article.slug,
        title: article.title,
        description: articleExcerpt(article.plainText),
        publishedAt,
        updatedAt: article.modifiedAt ? new Date(article.modifiedAt) : null,
        author: article.author,
        inLanguage,
      }, appLocale)} />
    </>
  );
}
