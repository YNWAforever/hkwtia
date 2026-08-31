import "server-only";

import {and, asc, desc, eq, isNotNull, isNull, lte} from "drizzle-orm";
import {z} from "zod";

import {getDb, type Database} from "@/lib/db/repos/common";
import {posts} from "@/lib/db/server-schema";

const slugSchema = z.string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const publicReadLimitSchema = z.number().int().min(1).max(12);
const publishedBuildLogSummaryRowSchema = z.object({
  slug: slugSchema,
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  publishedAt: z.date(),
  author: z.string().min(1),
}).strict();
const publishedBuildLogDetailRowSchema =
  publishedBuildLogSummaryRowSchema.extend({
    bodyMdx: z.string(),
  }).strict();

export type PublishedBuildLogSummary = Readonly<
  z.infer<typeof publishedBuildLogSummaryRowSchema>
>;
export type PublishedBuildLogDetail = Readonly<
  z.infer<typeof publishedBuildLogDetailRowSchema>
>;
export type PublishedNewsSummary = PublishedBuildLogSummary;
export type PublishedNewsDetail = PublishedBuildLogDetail;
export type PublicReadOptions = Readonly<{limit?: number}>;

const readLimit = (options: PublicReadOptions = {}) =>
  options.limit === undefined ? undefined : publicReadLimitSchema.parse(options.limit);

export type PublicPostsRepository = Readonly<{
  listPublishedBuildLogs: (
    asOf?: Date,
  ) => Promise<readonly PublishedBuildLogSummary[]>;
  getPublishedBuildLogBySlug: (
    slug: string,
    asOf?: Date,
  ) => Promise<PublishedBuildLogDetail | null>;
  listPublishedNews: (
    asOf?: Date,
    options?: PublicReadOptions,
  ) => Promise<readonly PublishedNewsSummary[]>;
  getPublishedNewsBySlug: (
    slug: string,
    asOf?: Date,
  ) => Promise<PublishedNewsDetail | null>;
}>;

type DatabaseLoader = () => Promise<Database>;

export function parsePublishedBuildLogSlug(slug: string): string {
  return slugSchema.parse(slug);
}

export function createPublicPostsRepository(
  loadDatabase: DatabaseLoader = getDb,
): PublicPostsRepository {
  return {
    async listPublishedBuildLogs(asOf = new Date()) {
      const database = await loadDatabase();
      const rows = await database
        .select({
          slug: posts.slug,
          titleEn: posts.titleEn,
          titleZh: posts.titleZh,
          publishedAt: posts.publishedAt,
          author: posts.author,
        })
        .from(posts)
        .where(and(
          eq(posts.kind, "buildlog"),
          isNotNull(posts.publishedAt),
          lte(posts.publishedAt, asOf),
        ))
        .orderBy(desc(posts.publishedAt), asc(posts.slug));

      return publishedBuildLogSummaryRowSchema.array().parse(rows);
    },

    async getPublishedBuildLogBySlug(slug, asOf = new Date()) {
      const parsedSlug = parsePublishedBuildLogSlug(slug);
      const database = await loadDatabase();
      const rows = await database
        .select({
          slug: posts.slug,
          titleEn: posts.titleEn,
          titleZh: posts.titleZh,
          publishedAt: posts.publishedAt,
          author: posts.author,
          bodyMdx: posts.bodyMdx,
        })
        .from(posts)
        .where(and(
          eq(posts.kind, "buildlog"),
          isNotNull(posts.publishedAt),
          lte(posts.publishedAt, asOf),
          eq(posts.slug, parsedSlug),
        ))
        .limit(1);

      const row = rows[0];
      return row ? publishedBuildLogDetailRowSchema.parse(row) : null;
    },

    // Deliberately separate from the build-log readers rather than a shared
    // `kind` parameter: those feed the public AI-Ops evidence panel, where a
    // news article must never appear.
    async listPublishedNews(asOf = new Date(), options = {}) {
      const limit = readLimit(options);
      const database = await loadDatabase();
      const query = database
        .select({
          slug: posts.slug,
          titleEn: posts.titleEn,
          titleZh: posts.titleZh,
          publishedAt: posts.publishedAt,
          author: posts.author,
        })
        .from(posts)
        .where(and(
          eq(posts.kind, "news"),
          isNotNull(posts.publishedAt),
          lte(posts.publishedAt, asOf),
          // An archived post is retired, not merely unpublished: it leaves the
          // feed, its slug route and the sitemap together.
          isNull(posts.archivedAt),
        ))
        .orderBy(desc(posts.publishedAt), asc(posts.slug));
      const rows = await (limit === undefined ? query : query.limit(limit));

      return publishedBuildLogSummaryRowSchema.array().parse(rows);
    },

    async getPublishedNewsBySlug(slug, asOf = new Date()) {
      const parsedSlug = parsePublishedBuildLogSlug(slug);
      const database = await loadDatabase();
      const rows = await database
        .select({
          slug: posts.slug,
          titleEn: posts.titleEn,
          titleZh: posts.titleZh,
          publishedAt: posts.publishedAt,
          author: posts.author,
          bodyMdx: posts.bodyMdx,
        })
        .from(posts)
        .where(and(
          eq(posts.kind, "news"),
          isNotNull(posts.publishedAt),
          lte(posts.publishedAt, asOf),
          isNull(posts.archivedAt),
          eq(posts.slug, parsedSlug),
        ))
        .limit(1);

      const row = rows[0];
      return row ? publishedBuildLogDetailRowSchema.parse(row) : null;
    },
  };
}

export const publicPostsRepository = createPublicPostsRepository();

export function listPublishedBuildLogs(
  asOf?: Date,
): Promise<readonly PublishedBuildLogSummary[]> {
  return publicPostsRepository.listPublishedBuildLogs(asOf);
}

export function getPublishedBuildLogBySlug(
  slug: string,
  asOf?: Date,
): Promise<PublishedBuildLogDetail | null> {
  return publicPostsRepository.getPublishedBuildLogBySlug(slug, asOf);
}

export function listPublishedNews(
  asOf?: Date,
  options?: PublicReadOptions,
): Promise<readonly PublishedNewsSummary[]> {
  return publicPostsRepository.listPublishedNews(asOf, options);
}

export function getPublishedNewsBySlug(
  slug: string,
  asOf?: Date,
): Promise<PublishedNewsDetail | null> {
  return publicPostsRepository.getPublishedNewsBySlug(slug, asOf);
}
