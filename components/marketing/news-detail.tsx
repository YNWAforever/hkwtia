import {SafeStructuredContent} from "@/components/content/safe-structured-content";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import type {PublishedNewsDetail} from "@/lib/db/repos/public-posts";

export function NewsDetail({
  locale,
  post,
}: Readonly<{
  locale: AppLocale;
  post: PublishedNewsDetail;
}>) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(post.publishedAt);

  return (
    <>
      <PageHero
        eyebrow={post.author}
        title={post.title}
        description={date}
      />
      <section className="container mx-auto px-6 py-12">
        <SafeStructuredContent
          content={post.body}
          mode="build-log"
          tableHeaders={{kpi: "", value: ""}}
        />
      </section>
    </>
  );
}
