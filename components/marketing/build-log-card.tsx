import Link from "next/link";

import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import type {PublishedBuildLogSummary} from "@/lib/db/repos/public-posts";
import {localizedPath} from "@/lib/urls";

export function BuildLogCard({
  locale,
  post,
  statusLabel,
}: Readonly<{
  locale: AppLocale;
  post: PublishedBuildLogSummary;
  statusLabel: string;
}>) {
  const title = locale === "zh-HK" ? post.titleZh : post.titleEn;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(post.publishedAt);

  return (
    <article>
      <StatusLabel>{statusLabel}</StatusLabel>
      <h2>
        <Link href={localizedPath(locale, `/news/${post.slug}`)}>{title}</Link>
      </h2>
      <p>
        <span>{date}</span>
        <span aria-hidden="true"> · </span>
        <span>{post.author}</span>
      </p>
    </article>
  );
}
