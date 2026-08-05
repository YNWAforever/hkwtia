import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

/**
 * Listing card for a statically authored news post. Build logs come from the
 * database and use BuildLogCard; both render the same shape.
 */
export function NewsCard({
  locale,
  slug,
  title,
  publishedAt,
}: Readonly<{
  locale: AppLocale;
  slug: string;
  title: string;
  publishedAt: string;
}>) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(publishedAt));

  return (
    <article className="glass-card space-y-3 p-6">
      <h2 className="font-serif text-2xl font-semibold">
        <Link href={localizedPath(locale, `/news/${slug}`)}>{title}</Link>
      </h2>
      <p className="text-sm text-muted-foreground">{date}</p>
    </article>
  );
}
