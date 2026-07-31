import {SafeStructuredContent} from "@/components/content/safe-structured-content";
import {PageHero} from "@/components/marketing/page-hero";
import type {AppLocale} from "@/i18n/routing";
import type {PublishedBuildLogDetail} from "@/lib/db/repos/public-posts";

export function BuildLogDetail({
  locale,
  post,
}: Readonly<{
  locale: AppLocale;
  post: PublishedBuildLogDetail;
}>) {
  const title = locale === "zh-HK" ? post.titleZh : post.titleEn;
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Asia/Hong_Kong",
  }).format(post.publishedAt);

  return (
    <>
      <PageHero
        eyebrow={post.author}
        title={title}
        description={date}
      />
      <section className="container mx-auto px-6 py-12">
        <SafeStructuredContent
          content={post.bodyMdx}
          mode="build-log"
          tableHeaders={{kpi: "", value: ""}}
        />
      </section>
    </>
  );
}
