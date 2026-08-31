import "server-only";

import {and, asc, desc, eq, isNotNull, isNull, lte, sql} from "drizzle-orm";
import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {getDb, type Database} from "@/lib/db/repos/common";
import {posts} from "@/lib/db/server-schema";

const slugSchema = z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const publicReadLimitSchema = z.number().int().min(1).max(12);
const publishedBuildLogSummaryRowSchema = z.object({slug: slugSchema, titleEn: z.string().min(1), titleZh: z.string().min(1), publishedAt: z.date(), author: z.string().min(1)}).strict();
const publishedBuildLogDetailRowSchema = publishedBuildLogSummaryRowSchema.extend({bodyMdx: z.string()}).strict();
const publishedNewsSummaryRowSchema = z.object({slug: slugSchema, title: z.string().min(1), publishedAt: z.date(), author: z.string().min(1)}).strict();
const publishedNewsDetailRowSchema = publishedNewsSummaryRowSchema.extend({body: z.string()}).strict();
const rawLocalizedNewsRowSchema = z.object({slug: slugSchema, title: z.string().nullable(), publishedAt: z.date(), author: z.string().min(1), body: z.string().nullable()}).strict();

export type PublishedBuildLogSummary = Readonly<z.infer<typeof publishedBuildLogSummaryRowSchema>>;
export type PublishedBuildLogDetail = Readonly<z.infer<typeof publishedBuildLogDetailRowSchema>>;
export type PublishedNewsSummary = Readonly<z.infer<typeof publishedNewsSummaryRowSchema>>;
export type PublishedNewsDetail = Readonly<z.infer<typeof publishedNewsDetailRowSchema>>;
export type PublicReadOptions = Readonly<{limit?: number}>;

const ecmascriptWhitespaceSql = sql.raw("U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'");
const isChineseNewsText = (value: string | null): value is string => typeof value === "string" && value.trim().length > 0;
const readLimit = (options: PublicReadOptions = {}) => options.limit === undefined ? undefined : publicReadLimitSchema.parse(options.limit);

export type PublicPostsRepository = Readonly<{
  listPublishedBuildLogs: (asOf?: Date) => Promise<readonly PublishedBuildLogSummary[]>;
  getPublishedBuildLogBySlug: (slug: string, asOf?: Date) => Promise<PublishedBuildLogDetail | null>;
  listPublishedNews: (locale: AppLocale, asOf?: Date, options?: PublicReadOptions) => Promise<readonly PublishedNewsSummary[]>;
  getPublishedNewsBySlug: (locale: AppLocale, slug: string, asOf?: Date) => Promise<PublishedNewsDetail | null>;
}>;
type DatabaseLoader = () => Promise<Database>;
export function parsePublishedBuildLogSlug(slug: string): string { return slugSchema.parse(slug); }
function localizedNewsTitle(locale: AppLocale) { return locale === "zh-HK" ? posts.titleZh : posts.titleEn; }
function localizedNewsBody(locale: AppLocale) { return locale === "zh-HK" ? posts.bodyMdxZhHk : posts.bodyMdx; }
function localizedNewsPredicates(locale: AppLocale, asOf: Date) {
  const predicates = [eq(posts.kind, "news"), isNotNull(posts.publishedAt), lte(posts.publishedAt, asOf), isNull(posts.archivedAt)];
  if (locale === "zh-HK") predicates.push(isNotNull(posts.titleZh), sql`char_length(btrim(${posts.titleZh}, ${ecmascriptWhitespaceSql})) > 0`, isNotNull(posts.bodyMdxZhHk), sql`char_length(btrim(${posts.bodyMdxZhHk}, ${ecmascriptWhitespaceSql})) > 0`);
  return predicates;
}
function parseLocalizedNewsSummary(locale: AppLocale, value: unknown): PublishedNewsSummary | null {
  const raw = rawLocalizedNewsRowSchema.parse(value);
  if (locale === "zh-HK" && (!isChineseNewsText(raw.title) || !isChineseNewsText(raw.body))) return null;
  return publishedNewsSummaryRowSchema.parse({slug: raw.slug, title: raw.title, publishedAt: raw.publishedAt, author: raw.author});
}
function parseLocalizedNewsDetail(locale: AppLocale, value: unknown): PublishedNewsDetail | null {
  const raw = rawLocalizedNewsRowSchema.parse(value);
  if (locale === "zh-HK" && (!isChineseNewsText(raw.title) || !isChineseNewsText(raw.body))) return null;
  return publishedNewsDetailRowSchema.parse(raw);
}

export function createPublicPostsRepository(loadDatabase: DatabaseLoader = getDb): PublicPostsRepository {
  return {
    async listPublishedBuildLogs(asOf = new Date()) {
      const database = await loadDatabase();
      const rows = await database.select({slug: posts.slug, titleEn: posts.titleEn, titleZh: posts.titleZh, publishedAt: posts.publishedAt, author: posts.author}).from(posts).where(and(eq(posts.kind, "buildlog"), isNotNull(posts.publishedAt), lte(posts.publishedAt, asOf))).orderBy(desc(posts.publishedAt), asc(posts.slug));
      return publishedBuildLogSummaryRowSchema.array().parse(rows);
    },
    async getPublishedBuildLogBySlug(slug, asOf = new Date()) {
      const parsedSlug = parsePublishedBuildLogSlug(slug);
      const database = await loadDatabase();
      const rows = await database.select({slug: posts.slug, titleEn: posts.titleEn, titleZh: posts.titleZh, publishedAt: posts.publishedAt, author: posts.author, bodyMdx: posts.bodyMdx}).from(posts).where(and(eq(posts.kind, "buildlog"), isNotNull(posts.publishedAt), lte(posts.publishedAt, asOf), eq(posts.slug, parsedSlug))).limit(1);
      return rows[0] ? publishedBuildLogDetailRowSchema.parse(rows[0]) : null;
    },
    async listPublishedNews(locale, asOf = new Date(), options = {}) {
      const limit = readLimit(options);
      const database = await loadDatabase();
      const query = database.select({slug: posts.slug, title: localizedNewsTitle(locale), publishedAt: posts.publishedAt, author: posts.author, body: localizedNewsBody(locale)}).from(posts).where(and(...localizedNewsPredicates(locale, asOf))).orderBy(desc(posts.publishedAt), asc(posts.slug));
      const rows = await (limit === undefined ? query : query.limit(limit));
      return rows.flatMap((row) => { const parsed = parseLocalizedNewsSummary(locale, row); return parsed ? [parsed] : []; });
    },
    async getPublishedNewsBySlug(locale, slug, asOf = new Date()) {
      const parsedSlug = parsePublishedBuildLogSlug(slug);
      const database = await loadDatabase();
      const rows = await database.select({slug: posts.slug, title: localizedNewsTitle(locale), publishedAt: posts.publishedAt, author: posts.author, body: localizedNewsBody(locale)}).from(posts).where(and(...localizedNewsPredicates(locale, asOf), eq(posts.slug, parsedSlug))).limit(1);
      return rows[0] ? parseLocalizedNewsDetail(locale, rows[0]) : null;
    },
  };
}

export const publicPostsRepository = createPublicPostsRepository();
export function listPublishedBuildLogs(asOf?: Date): Promise<readonly PublishedBuildLogSummary[]> { return publicPostsRepository.listPublishedBuildLogs(asOf); }
export function getPublishedBuildLogBySlug(slug: string, asOf?: Date): Promise<PublishedBuildLogDetail | null> { return publicPostsRepository.getPublishedBuildLogBySlug(slug, asOf); }
export function listPublishedNews(locale: AppLocale, asOf?: Date, options?: PublicReadOptions): Promise<readonly PublishedNewsSummary[]> { return publicPostsRepository.listPublishedNews(locale, asOf, options); }
export function getPublishedNewsBySlug(locale: AppLocale, slug: string, asOf?: Date): Promise<PublishedNewsDetail | null> { return publicPostsRepository.getPublishedNewsBySlug(locale, slug, asOf); }
