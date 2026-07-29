import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {PublishedBuildLogSummary} from "@/lib/db/repos/public-posts";
import {localizedPath} from "@/lib/urls";

export function BuildLogCard({
  locale,
  post,
}: Readonly<{
  locale: AppLocale;
  post: PublishedBuildLogSummary;
}>) {
  const title = locale === "zh-HK" ? post.titleZh : post.titleEn;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(post.publishedAt);

  return (
    <article className="glass-card space-y-3 p-6">
      <h2 className="font-serif text-2xl font-semibold">
        <Link href={localizedPath(locale, `/news/${post.slug}`)}>{title}</Link>
      </h2>
      <p className="text-sm text-muted-foreground">
        <span>{date}</span>
        <span aria-hidden="true"> · </span>
        <span>{post.author}</span>
      </p>
    </article>
  );
}
