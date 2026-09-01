import "server-only";

import {and, asc, desc, eq, gt, isNotNull, isNull, lte} from "drizzle-orm";
import {z} from "zod";

import {publicRoutes, type PublicRoute} from "@/config/public-routes";
import {projectPersistedAnnouncement, type ScheduledAnnouncementProjection} from "@/lib/public-shell/announcement";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {
  auditEvents,
  siteAnnouncements,
  type SiteAnnouncement,
} from "@/lib/db/server-schema";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const announcementIdSchema = z.string().uuid();

function trimmedUnicodeText(maximum: number) {
  return z.string().transform((value) => value.trim()).superRefine((value, context) => {
    const length = Array.from(value).length;
    if (length < 1 || length > maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ANNOUNCEMENT_TEXT_LENGTH_INVALID",
      });
    }
  });
}

const canonicalHrefSchema = z.custom<PublicRoute>(
  (value) => typeof value === "string" && publicRoutes.includes(value as PublicRoute),
  "ANNOUNCEMENT_HREF_INVALID",
);

const announcementInputObjectSchema = z.object({
  titleEn: trimmedUnicodeText(180),
  titleZhHk: trimmedUnicodeText(180),
  ctaLabelEn: trimmedUnicodeText(60),
  ctaLabelZhHk: trimmedUnicodeText(60),
  href: canonicalHrefSchema,
  startsAt: z.date(),
  endsAt: z.date(),
  priority: z.number().int().min(0).max(1000),
}).strict();

function validWindow(
  value: Readonly<{startsAt: Date; endsAt: Date}>,
  context: z.RefinementCtx,
): void {
  if (value.endsAt <= value.startsAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "ANNOUNCEMENT_WINDOW_INVALID",
    });
  }
}

const announcementInputSchema = announcementInputObjectSchema.superRefine(validWindow);
const announcementUpdateSchema = announcementInputObjectSchema.partial().superRefine((value, context) => {
  if (Object.keys(value).length === 0) {
    context.addIssue({code: z.ZodIssueCode.custom, message: "ANNOUNCEMENT_UPDATE_EMPTY"});
  }
});
const announcementWindowSchema = z.object({startsAt: z.date(), endsAt: z.date()})
  .superRefine(validWindow);

type StoredAnnouncementInput = z.output<typeof announcementInputSchema>;
type StoredAnnouncementUpdate = z.output<typeof announcementUpdateSchema>;

type AnnouncementAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"];
  action: "announcement.created" | "announcement.updated"
    | "announcement.published" | "announcement.unpublished"
    | "announcement.archived" | "announcement.unarchived";
  targetType: "announcement";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type AnnouncementMutationDependencies = Readonly<{
  transaction: <T>(work: (transaction: Readonly<{
    insertAnnouncement: (input: StoredAnnouncementInput) => Promise<SiteAnnouncement>;
    lockAnnouncement: (id: string) => Promise<SiteAnnouncement | null>;
    updateAnnouncement: (id: string, input: StoredAnnouncementUpdate) => Promise<SiteAnnouncement | null>;
    setPublishedAt: (id: string, publishedAt: Date | null) => Promise<SiteAnnouncement | null>;
    setArchivedAt: (id: string, archivedAt: Date | null) => Promise<SiteAnnouncement | null>;
    insertAudit: (input: AnnouncementAudit) => Promise<void>;
  }>) => Promise<T>) => Promise<T>;
}>;

export type AnnouncementReadDependencies = Readonly<{
  list: (limit: number) => Promise<readonly SiteAnnouncement[]>;
  get: (id: string) => Promise<SiteAnnouncement | null>;
}>;

export type ActiveAnnouncementSource = readonly SiteAnnouncement[] | Readonly<{
  getActive: (asOf: Date) => Promise<SiteAnnouncement | null>;
}>;

async function defaultMutationDependencies(): Promise<AnnouncementMutationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    insertAnnouncement: async (input) => {
      const [row] = await tx.insert(siteAnnouncements).values(input).returning();
      if (!row) throw new Error("ANNOUNCEMENT_INSERT_FAILED");
      return row;
    },
    lockAnnouncement: async (id) => (
      await tx.select().from(siteAnnouncements)
        .where(eq(siteAnnouncements.id, id)).for("update")
    )[0] ?? null,
    updateAnnouncement: async (id, input) => (
      await tx.update(siteAnnouncements).set({...input, updatedAt: new Date()})
        .where(eq(siteAnnouncements.id, id)).returning()
    )[0] ?? null,
    setPublishedAt: async (id, publishedAt) => (
      await tx.update(siteAnnouncements).set({publishedAt, updatedAt: new Date()})
        .where(eq(siteAnnouncements.id, id)).returning()
    )[0] ?? null,
    setArchivedAt: async (id, archivedAt) => (
      await tx.update(siteAnnouncements).set({archivedAt, updatedAt: new Date()})
        .where(eq(siteAnnouncements.id, id)).returning()
    )[0] ?? null,
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

async function defaultReadDependencies(): Promise<AnnouncementReadDependencies> {
  const db = await getDb();
  return {
    list: async (limit) => db.select().from(siteAnnouncements)
      .orderBy(desc(siteAnnouncements.createdAt), asc(siteAnnouncements.id)).limit(limit),
    get: async (id) => (await db.select().from(siteAnnouncements)
      .where(eq(siteAnnouncements.id, id)).limit(1))[0] ?? null,
  };
}

async function defaultActiveSource(): Promise<Exclude<ActiveAnnouncementSource, readonly SiteAnnouncement[]>> {
  const db = await getDb();
  return {getActive: async (asOf) => (await db.select().from(siteAnnouncements)
    .where(and(
      isNull(siteAnnouncements.archivedAt),
      isNotNull(siteAnnouncements.publishedAt),
      lte(siteAnnouncements.publishedAt, asOf),
      lte(siteAnnouncements.startsAt, asOf),
      gt(siteAnnouncements.endsAt, asOf),
    ))
    .orderBy(
      desc(siteAnnouncements.priority),
      desc(siteAnnouncements.startsAt),
      asc(siteAnnouncements.id),
    )
    .limit(1))[0] ?? null};
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

export async function createAnnouncement(
  actor: Actor,
  input: unknown,
  dependencies?: AnnouncementMutationDependencies,
): Promise<SiteAnnouncement> {
  requireAdmin(actor);
  const parsed = announcementInputSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const row = await transaction.insertAnnouncement(parsed);
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "announcement.created",
      targetType: "announcement",
      targetId: row.id,
      metadata: {href: row.href},
    });
    return row;
  });
}

export async function updateAnnouncement(
  actor: Actor,
  id: unknown,
  input: unknown,
  dependencies?: AnnouncementMutationDependencies,
): Promise<SiteAnnouncement | null> {
  requireAdmin(actor);
  const announcementId = announcementIdSchema.parse(id);
  const parsed = announcementUpdateSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockAnnouncement(announcementId);
    if (!current) return null;
    announcementWindowSchema.parse({
      startsAt: parsed.startsAt ?? current.startsAt,
      endsAt: parsed.endsAt ?? current.endsAt,
    });
    const changed = Object.entries(parsed)
      .filter(([key, value]) => !sameValue(current[key as keyof StoredAnnouncementInput], value))
      .map(([key]) => key)
      .sort();
    if (changed.length === 0) return current;
    const update = Object.fromEntries(
      changed.map((key) => [key, parsed[key as keyof StoredAnnouncementUpdate]]),
    ) as StoredAnnouncementUpdate;
    const row = await transaction.updateAnnouncement(announcementId, update);
    if (!row) return null;
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "announcement.updated",
      targetType: "announcement",
      targetId: row.id,
      metadata: {fields: changed},
    });
    return row;
  });
}

export async function setAnnouncementPublished(
  actor: Actor,
  id: unknown,
  published: boolean,
  dependencies?: AnnouncementMutationDependencies,
  clock: () => Date = () => new Date(),
): Promise<SiteAnnouncement | null> {
  requireAdmin(actor);
  const announcementId = announcementIdSchema.parse(id);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockAnnouncement(announcementId);
    if (!current) return null;
    if (published === (current.publishedAt !== null)) return current;
    const row = await transaction.setPublishedAt(announcementId, published ? clock() : null);
    if (!row) return null;
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: published ? "announcement.published" : "announcement.unpublished",
      targetType: "announcement",
      targetId: row.id,
      metadata: {href: row.href},
    });
    return row;
  });
}

export async function setAnnouncementArchived(
  actor: Actor,
  id: unknown,
  archived: boolean,
  dependencies?: AnnouncementMutationDependencies,
  clock: () => Date = () => new Date(),
): Promise<SiteAnnouncement | null> {
  requireAdmin(actor);
  const announcementId = announcementIdSchema.parse(id);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockAnnouncement(announcementId);
    if (!current) return null;
    if (archived === (current.archivedAt !== null)) return current;
    const row = await transaction.setArchivedAt(announcementId, archived ? clock() : null);
    if (!row) return null;
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: archived ? "announcement.archived" : "announcement.unarchived",
      targetType: "announcement",
      targetId: row.id,
      metadata: {href: row.href},
    });
    return row;
  });
}

export async function listAnnouncementsForAdmin(
  actor: Actor,
  dependencies?: AnnouncementReadDependencies,
): Promise<readonly SiteAnnouncement[]> {
  requireAdmin(actor);
  return (dependencies ?? await defaultReadDependencies()).list(100);
}

export async function getAnnouncementForAdmin(
  actor: Actor,
  id: unknown,
  dependencies?: AnnouncementReadDependencies,
): Promise<SiteAnnouncement | null> {
  requireAdmin(actor);
  const announcementId = announcementIdSchema.safeParse(id);
  if (!announcementId.success) return null;
  return (dependencies ?? await defaultReadDependencies()).get(announcementId.data);
}

function activeSourceHasReader(
  source: ActiveAnnouncementSource,
): source is Exclude<ActiveAnnouncementSource, readonly SiteAnnouncement[]> {
  return !Array.isArray(source);
}

export async function getActiveAnnouncement(
  asOfInput: unknown,
  source?: ActiveAnnouncementSource,
): Promise<ScheduledAnnouncementProjection | null> {
  const asOf = z.date().parse(asOfInput);
  const selected = source ?? await defaultActiveSource();
  const row = activeSourceHasReader(selected)
    ? await selected.getActive(asOf)
    : [...selected]
      .filter((candidate) => candidate.archivedAt === null
        && candidate.publishedAt !== null
        && candidate.publishedAt <= asOf
        && candidate.startsAt <= asOf
        && candidate.endsAt > asOf)
      .sort((left, right) => right.priority - left.priority
        || right.startsAt.getTime() - left.startsAt.getTime()
        || left.id.localeCompare(right.id))[0] ?? null;
  return row ? projectPersistedAnnouncement(row) : null;
}

export const announcementsRepository = {
  create: createAnnouncement,
  update: updateAnnouncement,
  setPublished: setAnnouncementPublished,
  setArchived: setAnnouncementArchived,
  listForAdmin: listAnnouncementsForAdmin,
  getForAdmin: getAnnouncementForAdmin,
  getActive: getActiveAnnouncement,
};
