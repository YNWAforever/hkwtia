import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/** Listing card for a staff-authored news post. Build logs use BuildLogCard. */
export function NewsCard({
  locale,
  slug,
  title,
  publishedAt,
  author,
}: Readonly<{
  locale: AppLocale;
  slug: string;
  title: string;
  publishedAt: Date | string;
  author?: string;
}>) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(publishedAt instanceof Date ? publishedAt : new Date(publishedAt));

  return (
    <article className="glass-card space-y-3 p-6">
      <h2 className="font-serif text-2xl font-semibold">
        <Link href={localizedPath(locale, `/news/${slug}`)}>{title}</Link>
      </h2>
      <p className="text-sm text-muted-foreground">
        <span>{date}</span>
        {author ? <><span aria-hidden="true"> · </span><span>{author}</span></> : null}
      </p>
    </article>
  );
}
