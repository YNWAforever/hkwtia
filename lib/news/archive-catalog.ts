import {existsSync, readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {archiveArticleSchema, archiveNotice, titleLangForLocale, type ArchiveArticle, type ArchiveNotice} from "@/lib/news/archive-document";
import type {AppLocale} from "@/i18n/routing";

const DIRECTORY = join(process.cwd(), "content/news-archive/articles");

let cached: readonly ArchiveArticle[] | null = null;

export function loadArchiveArticles(): readonly ArchiveArticle[] {
  if (cached) return cached;
  if (!existsSync(DIRECTORY)) {
    cached = [];
    return cached;
  }
  const articles = readdirSync(DIRECTORY)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => archiveArticleSchema.parse(JSON.parse(readFileSync(join(DIRECTORY, name), "utf8"))));
  const slugs = new Set<string>();
  const urls = new Set<string>();
  for (const article of articles) {
    if (slugs.has(article.slug)) throw new Error(`Duplicate news archive slug: ${article.slug}`);
    if (urls.has(article.canonicalUrl)) throw new Error(`Duplicate news archive URL: ${article.canonicalUrl}`);
    slugs.add(article.slug);
    urls.add(article.canonicalUrl);
  }
  cached = articles;
  return cached;
}

export function resetArchiveCatalogForTests(): void {
  cached = null;
}

export function archiveBySlug(slug: string): ArchiveArticle | null {
  return loadArchiveArticles().find((article) => article.slug === slug) ?? null;
}

export type ArchiveCard = Readonly<{
  slug: string;
  title: string;
  titleLang?: "en" | "zh-Hant";
  publishedAt: Date;
  author: string;
  searchText: string;
  notice: ArchiveNotice;
  collection: "news-archive" | "review-candidate";
  sourceCategory: string | null;
}>;

export function archiveCards(locale: AppLocale): readonly ArchiveCard[] {
  return loadArchiveArticles()
    .filter((article) => article.extractionStatus !== "failed")
    .map((article) => ({
      slug: article.slug,
      title: article.title,
      titleLang: titleLangForLocale(article.title, locale),
      publishedAt: new Date(article.publishedAt),
      author: article.author,
      searchText: `${article.title}\n${article.plainText}`,
      notice: archiveNotice(locale, article.sourceLanguages),
      collection: article.collection,
      sourceCategory: article.collection === "review-candidate" ? article.categories[0] ?? null : null,
    }))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || a.slug.localeCompare(b.slug));
}

export const NEWS_PAGE_SIZE = 12;

export function paginateNews<T>(items: readonly T[], requestedPage: number, size = NEWS_PAGE_SIZE): {page: number; pages: number; items: readonly T[]} {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, requestedPage));
  const start = (page - 1) * size;
  return {page, pages, items: items.slice(start, start + size)};
}

export function newsQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  return raw.replace(/[^\p{L}\p{N}\s.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function newsPageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
