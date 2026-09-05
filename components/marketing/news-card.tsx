import Link from "next/link";

import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/** Listing card for a staff-authored news post. Build logs use BuildLogCard. */
export function NewsCard({
  locale,
  slug,
  title,
  publishedAt,
  author,
  statusLabel,
}: Readonly<{
  locale: AppLocale;
  slug: string;
  title: string;
  publishedAt: Date | string;
  author?: string;
  statusLabel: string;
}>) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(publishedAt instanceof Date ? publishedAt : new Date(publishedAt));

  return (
    <article>
      <StatusLabel>{statusLabel}</StatusLabel>
      <h2>
        <Link href={localizedPath(locale, `/news/${slug}`)}>{title}</Link>
      </h2>
      <p>
        <span>{date}</span>
        {author ? <><span aria-hidden="true"> · </span><span>{author}</span></> : null}
      </p>
    </article>
  );
}
