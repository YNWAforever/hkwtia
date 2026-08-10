import "server-only";

import {and, asc, desc, eq} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, posts, type Post} from "@/lib/db/server-schema";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

/**
 * Staff authoring for `kind: "news"` only. Board drafts (`page`) and build logs
 * (`buildlog`) stay owned by the board-reporter agent and the M4C seed, and are
 * deliberately unreachable from this module.
 */
const NEWS_KIND = "news" as const;

const postIdSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1).max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

// titleZh is NOT NULL on posts, unlike events.titleZh — both locales required.
const newsInputObjectSchema = z.object({
  slug: slugSchema,
  titleEn: z.string().trim().min(1).max(500),
  titleZh: z.string().trim().min(1).max(500),
  bodyMdx: z.string().trim().min(1).max(500_000),
  author: z.string().trim().min(1).max(200),
  publishedAt: z.date().nullable(),
}).strict();

const newsInputSchema = newsInputObjectSchema;
const newsUpdateSchema = newsInputObjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  {message: "NEWS_UPDATE_EMPTY"},
);

type StoredNewsInput = z.output<typeof newsInputSchema>;
type StoredNewsUpdate = z.output<typeof newsUpdateSchema>;

type NewsAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"];
  action: "post.created" | "post.updated" | "post.published" | "post.unpublished";
  targetType: "post";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type NewsMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  findBySlug: (slug: string) => Promise<Readonly<{id: string}> | null>;
  insertPost: (input: StoredNewsInput) => Promise<Post>;
  lockPost: (id: string) => Promise<Post | null>;
  updatePost: (id: string, input: StoredNewsUpdate) => Promise<Post | null>;
  insertAudit: (input: NewsAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

export type NewsReadDependencies = Readonly<{
  list: () => Promise<readonly Post[]>;
  get: (id: string) => Promise<Post | null>;
}>;

/** `slug` is uniquely indexed across every post kind, so a clash is a field error. */
function slugConflictError(): z.ZodError {
  return new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: ["slug"],
    message: "NEWS_SLUG_TAKEN",
  }]);
}

async function defaultMutationDependencies(): Promise<NewsMutationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    findBySlug: async (slug) =>
      (await tx.select({id: posts.id}).from(posts).where(eq(posts.slug, slug)).limit(1))[0] ?? null,
    insertPost: async (input) => {
      const [row] = await tx.insert(posts).values({...input, kind: NEWS_KIND}).returning();
      if (!row) throw new Error("NEWS_INSERT_FAILED");
      return row;
    },
    lockPost: async (id) =>
      (await tx.select().from(posts)
        .where(and(eq(posts.id, id), eq(posts.kind, NEWS_KIND)))
        .for("update"))[0] ?? null,
    updatePost: async (id, input) =>
      (await tx.update(posts).set({...input, updatedAt: new Date()})
        .where(and(eq(posts.id, id), eq(posts.kind, NEWS_KIND)))
        .returning())[0] ?? null,
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

async function defaultReadDependencies(): Promise<NewsReadDependencies> {
  const db = await getDb();
  return {
    list: async () => db.select().from(posts).where(eq(posts.kind, NEWS_KIND))
      .orderBy(desc(posts.createdAt), asc(posts.slug)),
    get: async (id) => (await db.select().from(posts)
      .where(and(eq(posts.id, id), eq(posts.kind, NEWS_KIND))).limit(1))[0] ?? null,
  };
}

/** Emitted only on a transition, so a plain edit does not look like a publish. */
function publicationAudit(
  previous: Date | null,
  next: Date | null | undefined,
): "post.published" | "post.unpublished" | null {
  if (next === undefined) return null;
  if (previous === null && next !== null) return "post.published";
  if (previous !== null && next === null) return "post.unpublished";
  return null;
}

export async function createNewsPost(
  actor: Actor,
  input: unknown,
  dependencies?: NewsMutationDependencies,
): Promise<Post> {
  requireAdmin(actor);
  const parsed = newsInputSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    if (await transaction.findBySlug(parsed.slug)) throw slugConflictError();
    const post = await transaction.insertPost(parsed);
    await transaction.insertAudit({
      actorUserId: actor.profileId, actorType: actor.kind,
      action: "post.created", targetType: "post", targetId: post.id,
      metadata: {slug: post.slug, published: parsed.publishedAt !== null},
    });
    if (parsed.publishedAt !== null) {
      await transaction.insertAudit({
        actorUserId: actor.profileId, actorType: actor.kind,
        action: "post.published", targetType: "post", targetId: post.id,
        metadata: {slug: post.slug},
      });
    }
    return post;
  });
}

export async function updateNewsPost(
  actor: Actor,
  id: unknown,
  input: unknown,
  dependencies?: NewsMutationDependencies,
): Promise<Post | null> {
  requireAdmin(actor);
  const postId = postIdSchema.parse(id);
  const parsed = newsUpdateSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockPost(postId);
    if (!current) return null;
    if (parsed.slug !== undefined && parsed.slug !== current.slug) {
      const clash = await transaction.findBySlug(parsed.slug);
      if (clash && clash.id !== postId) throw slugConflictError();
    }
    const post = await transaction.updatePost(postId, parsed);
    if (!post) return null;
    await transaction.insertAudit({
      actorUserId: actor.profileId, actorType: actor.kind,
      action: "post.updated", targetType: "post", targetId: post.id,
      metadata: {fields: Object.keys(parsed).sort()},
    });
    const publication = publicationAudit(current.publishedAt, parsed.publishedAt);
    if (publication) {
      await transaction.insertAudit({
        actorUserId: actor.profileId, actorType: actor.kind,
        action: publication, targetType: "post", targetId: post.id,
        metadata: {slug: post.slug},
      });
    }
    return post;
  });
}

export async function listNewsForAdmin(
  actor: Actor,
  dependencies?: NewsReadDependencies,
): Promise<readonly Post[]> {
  requireAdmin(actor);
  return (dependencies ?? await defaultReadDependencies()).list();
}

export async function getNewsForAdmin(
  actor: Actor,
  id: unknown,
  dependencies?: NewsReadDependencies,
): Promise<Post | null> {
  requireAdmin(actor);
  const postId = postIdSchema.safeParse(id);
  if (!postId.success) return null;
  return (dependencies ?? await defaultReadDependencies()).get(postId.data);
}

export const adminPostsRepository = {
  create: createNewsPost,
  update: updateNewsPost,
  listForAdmin: listNewsForAdmin,
  getForAdmin: getNewsForAdmin,
};
