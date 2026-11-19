import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {NewsCard} from "@/components/marketing/news-card";
import {NewsQualityPanel} from "@/components/marketing/news-quality-panel";
import {StructuredData} from "@/components/seo/structured-data";
import {HonestDirectoryEmpty} from "@/components/wt/honest-directory-empty";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {PageHero} from "@/components/wt/page-hero";
import {Section} from "@/components/wt/section";
import type {AppLocale} from "@/i18n/routing";
import {listPublishedNews} from "@/lib/db/repos/public-posts";
import {archiveCards, newsPageNumber, newsQuery, paginateNews} from "@/lib/news/archive-catalog";
import {buildPageMetadata} from "@/lib/metadata";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = {params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "News"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/news",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function NewsPage({params, searchParams}: Props) {
  const {locale} = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const [t, common, tRoot] = await Promise.all([
    getTranslations({locale, namespace: "News"}),
    getTranslations({locale, namespace: "Common"}),
    // Unscoped: the breadcrumb label keys are fully qualified (`Navigation.links.*`).
    getTranslations({locale}),
  ]);
  const appLocale = locale as AppLocale;
  const search = newsQuery(query?.q);
  const requestedPage = newsPageNumber(query?.page);
  // Each feed can fail independently. The dated archive still renders if the database read fails.
  const news = await listPublishedNews(appLocale).catch(() => null);
  const unavailable = news === null;
  const cmsSlugs = new Set((news ?? []).map((post) => post.slug));
  const merged = [
    ...(news ?? []).map((post) => ({slug: post.slug, title: post.title, titleLang: undefined, publishedAt: post.publishedAt, author: post.author, searchText: post.title, sourceCategory: null as string | null})),
    ...archiveCards(appLocale).filter((post) => !cmsSlugs.has(post.slug)),
  ].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.slug.localeCompare(b.slug));
  const filtered = search
    ? merged.filter((post) => post.searchText.toLocaleLowerCase(appLocale).includes(search.toLocaleLowerCase(appLocale)))
    : merged;
  const page = paginateNews(filtered, requestedPage);

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        lead={t("description")}
        breadcrumb={{homeHref: "/", homeLabel: common("breadcrumbHome"), current: t("breadcrumbCurrent")}}
        breadcrumbLabel={common("breadcrumbLabel")}
      />
      <Section tone="paper">
        {/* Without it the outline jumped h1 -> h3 (the card or empty-state title). */}
        <h2 className="sr-only">{t("resultsHeading")}</h2>
        {unavailable ? <HonestEmpty variant="inner" title={t("unavailableTitle")} copy={t("unavailableDescription")} /> : null}
        <form action={localizedPath(appLocale, "/news")} className="news-search" method="get">
          <label htmlFor="news-q">{t("searchLabel")}</label>
          <input defaultValue={search} id="news-q" name="q" type="search" />
          <button type="submit">{t("searchSubmit")}</button>
        </form>
        {page.items.length > 0 ? (
          <div className="archive-grid">
            {page.items.map((post) => (
              <NewsCard
                author={post.author}
                key={post.slug}
                locale={appLocale}
                publishedAt={post.publishedAt}
                slug={post.slug}
                statusLabel={post.sourceCategory ?? t("statusNews")}
                title={post.title}
                titleLang={post.titleLang}
              />
            ))}
          </div>
        ) : unavailable ? null : search ? (
          <HonestEmpty variant="inner" title={t("noMatches")} copy={t("emptyDescription")} />
        ) : (
          <HonestDirectoryEmpty
            next={t("emptyDescription")}
            primary={{href: "/", label: t("emptyPrimary")}}
            secondary={{href: "/contact", label: t("emptySecondary")}}
            status={t("emptyTitle")}
          />
        )}
        {page.pages > 1 ? (
          <nav aria-label={t("resultsHeading")} className="news-pagination">
            {page.page > 1 ? <a href={newsHref(appLocale, page.page - 1, search)}>{t("previous")}</a> : null}
            <span>{t("pageStatus", {page: page.page, pages: page.pages})}</span>
            {page.page < page.pages ? <a href={newsHref(appLocale, page.page + 1, search)}>{t("next")}</a> : null}
          </nav>
        ) : null}
        <NewsQualityPanel labels={{eyebrow: t("quality.eyebrow"), title: t("quality.title"), body: t("quality.body")}} />
      </Section>
      <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(appLocale, "/news", tRoot))} />
    </>
  );
}

function newsHref(locale: AppLocale, page: number, search: string): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `${localizedPath(locale, "/news")}${query ? `?${query}` : ""}`;
}
