import "server-only";

import {asc, eq} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, media, type MediaRow} from "@/lib/db/server-schema";
import {isRegistrableMediaUrl} from "@/lib/media/url";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const mediaIdSchema = z.string().uuid();

// Alt text is required in both locales because a registry entry exists to be
// rendered, and an image rendered without an accessible name is a defect.
const mediaInputObjectSchema = z.object({
  url: z.string().trim().min(1).max(500)
    .refine(isRegistrableMediaUrl, {message: "MEDIA_URL_INVALID"}),
  altEn: z.string().trim().min(1).max(300),
  altZh: z.string().trim().min(1).max(300),
}).strict();

const mediaInputSchema = mediaInputObjectSchema;
const mediaUpdateSchema = mediaInputObjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  {message: "MEDIA_UPDATE_EMPTY"},
);

type StoredMediaInput = z.output<typeof mediaInputSchema>;
type StoredMediaUpdate = z.output<typeof mediaUpdateSchema>;

type MediaAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"];
  action: "media.created" | "media.updated";
  targetType: "media";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type MediaMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  findByUrl: (url: string) => Promise<Readonly<{id: string}> | null>;
  insertMedia: (input: StoredMediaInput & {registeredByProfileId: string}) => Promise<MediaRow>;
  lockMedia: (id: string) => Promise<MediaRow | null>;
  updateMedia: (id: string, input: StoredMediaUpdate) => Promise<MediaRow | null>;
  insertAudit: (input: MediaAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

export type MediaReadDependencies = Readonly<{
  list: () => Promise<readonly MediaRow[]>;
  get: (id: string) => Promise<MediaRow | null>;
}>;

/** `url` is uniquely indexed, so registering the same file twice is a field error. */
function urlConflictError(): z.ZodError {
  return new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: ["url"],
    message: "MEDIA_URL_TAKEN",
  }]);
}

async function defaultMutationDependencies(): Promise<MediaMutationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    findByUrl: async (url) =>
      (await tx.select({id: media.id}).from(media).where(eq(media.url, url)).limit(1))[0] ?? null,
    insertMedia: async (input) => {
      const [row] = await tx.insert(media).values(input).returning();
      if (!row) throw new Error("MEDIA_INSERT_FAILED");
      return row;
    },
    lockMedia: async (id) =>
      (await tx.select().from(media).where(eq(media.id, id)).for("update"))[0] ?? null,
    updateMedia: async (id, input) =>
      (await tx.update(media).set({...input, updatedAt: new Date()})
        .where(eq(media.id, id)).returning())[0] ?? null,
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

async function defaultReadDependencies(): Promise<MediaReadDependencies> {
  const db = await getDb();
  return {
    list: async () => db.select().from(media).orderBy(asc(media.altEn), asc(media.url)),
    get: async (id) => (await db.select().from(media).where(eq(media.id, id)).limit(1))[0] ?? null,
  };
}

export async function createMedia(
  actor: Actor,
  input: unknown,
  dependencies?: MediaMutationDependencies,
): Promise<MediaRow> {
  requireAdmin(actor);
  const parsed = mediaInputSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    if (await transaction.findByUrl(parsed.url)) throw urlConflictError();
    const row = await transaction.insertMedia({...parsed, registeredByProfileId: actor.profileId});
    await transaction.insertAudit({
      actorUserId: actor.profileId, actorType: actor.kind,
      action: "media.created", targetType: "media", targetId: row.id,
      metadata: {url: row.url},
    });
    return row;
  });
}

export async function updateMedia(
  actor: Actor,
  id: unknown,
  input: unknown,
  dependencies?: MediaMutationDependencies,
): Promise<MediaRow | null> {
  requireAdmin(actor);
  const mediaId = mediaIdSchema.parse(id);
  const parsed = mediaUpdateSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockMedia(mediaId);
    if (!current) return null;
    if (parsed.url !== undefined && parsed.url !== current.url) {
      const clash = await transaction.findByUrl(parsed.url);
      if (clash && clash.id !== mediaId) throw urlConflictError();
    }
    const changed = Object.entries(parsed)
      .filter(([key, value]) => current[key as keyof StoredMediaInput] !== value)
      .map(([key]) => key)
      .sort();
    // A save that changes nothing is not an event worth recording.
    if (changed.length === 0) return current;
    const row = await transaction.updateMedia(mediaId, parsed);
    if (!row) return null;
    await transaction.insertAudit({
      actorUserId: actor.profileId, actorType: actor.kind,
      action: "media.updated", targetType: "media", targetId: row.id,
      metadata: {url: row.url, fields: changed},
    });
    return row;
  });
}

export async function listMediaForAdmin(
  actor: Actor,
  dependencies?: MediaReadDependencies,
): Promise<readonly MediaRow[]> {
  requireAdmin(actor);
  return (dependencies ?? await defaultReadDependencies()).list();
}

export async function getMediaForAdmin(
  actor: Actor,
  id: unknown,
  dependencies?: MediaReadDependencies,
): Promise<MediaRow | null> {
  requireAdmin(actor);
  const mediaId = mediaIdSchema.safeParse(id);
  if (!mediaId.success) return null;
  return (dependencies ?? await defaultReadDependencies()).get(mediaId.data);
}

export const mediaRepository = {
  create: createMedia,
  update: updateMedia,
  listForAdmin: listMediaForAdmin,
  getForAdmin: getMediaForAdmin,
};
