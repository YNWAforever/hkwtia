import type {Metadata} from "next";
import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {BuildLogDetail} from "@/components/marketing/build-log-detail";
import type {AppLocale} from "@/i18n/routing";
import {
  getPublishedBuildLogBySlug,
  getPublishedNewsBySlug,
  parsePublishedBuildLogSlug,
  type PublishedBuildLogDetail,
} from "@/lib/db/repos/public-posts";
import {buildPageMetadata} from "@/lib/metadata";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string; slug: string}>};

function postSlugOrNotFound(slug: string): string {
  try {
    return parsePublishedBuildLogSlug(slug);
  } catch {
    notFound();
  }
}

/**
 * News and build logs share the /news/<slug> namespace and the single unique
 * slug index on posts, so a slug resolves to at most one of them.
 */
async function publishedPost(slug: string): Promise<PublishedBuildLogDetail> {
  const parsed = postSlugOrNotFound(slug);
  const post = await getPublishedNewsBySlug(parsed)
    ?? await getPublishedBuildLogBySlug(parsed);
  if (!post) notFound();
  return post;
}

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale, slug} = await params;
  const post = await publishedPost(slug);
  const title = locale === "zh-HK" ? post.titleZh : post.titleEn;
  return buildPageMetadata({
    locale: locale as AppLocale,
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
  const post = await publishedPost(slug);
  setRequestLocale(locale);
  return <BuildLogDetail locale={locale as AppLocale} post={post}/>;
}
