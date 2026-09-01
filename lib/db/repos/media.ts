import "server-only";

import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/authorize";
import { getDb } from "@/lib/db/repos/common";
import {
  auditEvents,
  media,
  partners,
  showcaseListings,
  type MediaRow,
} from "@/lib/db/server-schema";
import { isRegistrableMediaUrl } from "@/lib/media/url";
import type { Actor, AdminActor } from "@/lib/membership/lifecycle";

const mediaIdSchema = z.string().uuid();

// Alt text is required in both locales because a registry entry exists to be
// rendered, and an image rendered without an accessible name is a defect.
const mediaInputObjectSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine(isRegistrableMediaUrl, { message: "MEDIA_URL_INVALID" }),
    altEn: z.string().trim().min(1).max(300),
    altZh: z.string().trim().min(1).max(300),
  })
  .strict();

const mediaInputSchema = mediaInputObjectSchema;
const mediaUpdateSchema = mediaInputObjectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "MEDIA_UPDATE_EMPTY",
  });

type StoredMediaInput = z.output<typeof mediaInputSchema>;
type StoredMediaUpdate = z.output<typeof mediaUpdateSchema>;

type MediaAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"];
  action:
    | "media.created"
    | "media.updated"
    | "media.archived"
    | "media.unarchived"
    | "media.uploaded";
  targetType: "media";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type MediaMutationDependencies = Readonly<{
  transaction: <T>(
    work: (
      transaction: Readonly<{
        findByUrl: (url: string) => Promise<Readonly<{ id: string }> | null>;
        insertMedia: (
          input: StoredMediaInput & { registeredByProfileId: string },
        ) => Promise<MediaRow>;
        lockMedia: (id: string) => Promise<MediaRow | null>;
        updateMedia: (
          id: string,
          input: StoredMediaUpdate,
        ) => Promise<MediaRow | null>;
        countListingReferences: (id: string) => Promise<number>;
        countPartnerReferences?: (id: string) => Promise<number>;
        setArchivedAt: (
          id: string,
          archivedAt: Date | null,
        ) => Promise<MediaRow | null>;
        insertAudit: (input: MediaAudit) => Promise<void>;
      }>,
    ) => Promise<T>,
  ) => Promise<T>;
}>;

export type MediaReadDependencies = Readonly<{
  list: () => Promise<readonly MediaRow[]>;
  listActive: () => Promise<readonly MediaRow[]>;
  get: (id: string) => Promise<MediaRow | null>;
}>;

/**
 * An archived entry is still referenced by whatever already used it, so
 * archiving one that a listing still points at would blank that listing's logo
 * without anyone asking for it. Staff detach it first; this is the field error
 * that tells them so.
 */
function mediaInUseError(listings: number): z.ZodError {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ["archived"],
      message: "MEDIA_IN_USE",
      params: { listings },
    },
  ]);
}

/** `url` is uniquely indexed, so registering the same file twice is a field error. */
function urlConflictError(): z.ZodError {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ["url"],
      message: "MEDIA_URL_TAKEN",
    },
  ]);
}

function uploadedUrlImmutableError(): z.ZodError {
  return new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ["url"],
      message: "MEDIA_UPLOAD_URL_IMMUTABLE",
    },
  ]);
}

async function defaultMutationDependencies(): Promise<MediaMutationDependencies> {
  const db = await getDb();
  return {
    transaction: (work) =>
      db.transaction(async (tx) =>
        work({
          findByUrl: async (url) =>
            (
              await tx
                .select({ id: media.id })
                .from(media)
                .where(eq(media.url, url))
                .limit(1)
            )[0] ?? null,
          insertMedia: async (input) => {
            const [row] = await tx.insert(media).values(input).returning();
            if (!row) throw new Error("MEDIA_INSERT_FAILED");
            return row;
          },
          lockMedia: async (id) =>
            (
              await tx
                .select()
                .from(media)
                .where(eq(media.id, id))
                .for("update")
            )[0] ?? null,
          updateMedia: async (id, input) =>
            (
              await tx
                .update(media)
                .set({ ...input, updatedAt: new Date() })
                .where(eq(media.id, id))
                .returning()
            )[0] ?? null,
          countListingReferences: async (id) =>
            (
              await tx
                .select({ total: count() })
                .from(showcaseListings)
                .where(eq(showcaseListings.logoMediaId, id))
            )[0]?.total ?? 0,
          countPartnerReferences: async (id) =>
            (
              await tx
                .select({ total: count() })
                .from(partners)
                .where(eq(partners.logoMediaId, id))
            )[0]?.total ?? 0,
          setArchivedAt: async (id, archivedAt) =>
            (
              await tx
                .update(media)
                .set({ archivedAt, updatedAt: new Date() })
                .where(eq(media.id, id))
                .returning()
            )[0] ?? null,
          insertAudit: async (input) => {
            await tx.insert(auditEvents).values(input);
          },
        }),
      ),
  };
}

async function defaultReadDependencies(): Promise<MediaReadDependencies> {
  const db = await getDb();
  return {
    list: async () =>
      db.select().from(media).orderBy(asc(media.altEn), asc(media.url)),
    listActive: async () =>
      db
        .select()
        .from(media)
        .where(isNull(media.archivedAt))
        .orderBy(asc(media.altEn), asc(media.url)),
    get: async (id) =>
      (await db.select().from(media).where(eq(media.id, id)).limit(1))[0] ??
      null,
  };
}

export async function createMedia(
  actor: Actor,
  input: unknown,
  dependencies?: MediaMutationDependencies,
): Promise<MediaRow> {
  requireAdmin(actor);
  const parsed = mediaInputSchema.parse(input);
  return (dependencies ?? (await defaultMutationDependencies())).transaction(
    async (transaction) => {
      if (await transaction.findByUrl(parsed.url)) throw urlConflictError();
      const row = await transaction.insertMedia({
        ...parsed,
        registeredByProfileId: actor.profileId,
      });
      await transaction.insertAudit({
        actorUserId: actor.profileId,
        actorType: actor.kind,
        action: "media.created",
        targetType: "media",
        targetId: row.id,
        metadata: { url: row.url },
      });
      return row;
    },
  );
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
  return (dependencies ?? (await defaultMutationDependencies())).transaction(
    async (transaction) => {
      const current = await transaction.lockMedia(mediaId);
      if (!current) return null;
      if (
        current.storageKey !== null &&
        parsed.url !== undefined &&
        parsed.url !== current.url
      ) {
        throw uploadedUrlImmutableError();
      }
      if (parsed.url !== undefined && parsed.url !== current.url) {
        const clash = await transaction.findByUrl(parsed.url);
        if (clash && clash.id !== mediaId) throw urlConflictError();
      }
      const changed = Object.entries(parsed)
        .filter(
          ([key, value]) => current[key as keyof StoredMediaInput] !== value,
        )
        .map(([key]) => key)
        .sort();
      // A save that changes nothing is not an event worth recording.
      if (changed.length === 0) return current;
      const row = await transaction.updateMedia(mediaId, parsed);
      if (!row) return null;
      await transaction.insertAudit({
        actorUserId: actor.profileId,
        actorType: actor.kind,
        action: "media.updated",
        targetType: "media",
        targetId: row.id,
        metadata: { url: row.url, fields: changed },
      });
      return row;
    },
  );
}

/**
 * Archives or restores a registry entry. Archiving is refused while a showcase
 * listing still points at the image, so retiring one is never a silent change
 * to something already published.
 */
export async function setMediaArchived(
  actor: Actor,
  id: unknown,
  archived: boolean,
  dependencies?: MediaMutationDependencies,
  now: () => Date = () => new Date(),
): Promise<MediaRow | null> {
  requireAdmin(actor);
  const mediaId = mediaIdSchema.parse(id);
  return (dependencies ?? (await defaultMutationDependencies())).transaction(
    async (transaction) => {
      const current = await transaction.lockMedia(mediaId);
      if (!current) return null;
      // Already in the requested state: not an event worth recording.
      if (archived === (current.archivedAt !== null)) return current;
      if (archived) {
        const listings = await transaction.countListingReferences(mediaId);
        const partnerReferences =
          (await transaction.countPartnerReferences?.(mediaId)) ?? 0;
        if (listings + partnerReferences > 0)
          throw mediaInUseError(listings + partnerReferences);
      }
      const row = await transaction.setArchivedAt(
        mediaId,
        archived ? now() : null,
      );
      if (!row) return null;
      await transaction.insertAudit({
        actorUserId: actor.profileId,
        actorType: actor.kind,
        action: archived ? "media.archived" : "media.unarchived",
        targetType: "media",
        targetId: row.id,
        metadata: { url: row.url },
      });
      return row;
    },
  );
}

export async function listActiveMediaForAdmin(
  actor: Actor,
  dependencies?: MediaReadDependencies,
): Promise<readonly MediaRow[]> {
  requireAdmin(actor);
  return (dependencies ?? (await defaultReadDependencies())).listActive();
}

export async function listMediaForAdmin(
  actor: Actor,
  dependencies?: MediaReadDependencies,
): Promise<readonly MediaRow[]> {
  requireAdmin(actor);
  return (dependencies ?? (await defaultReadDependencies())).list();
}

export async function getMediaForAdmin(
  actor: Actor,
  id: unknown,
  dependencies?: MediaReadDependencies,
): Promise<MediaRow | null> {
  requireAdmin(actor);
  const mediaId = mediaIdSchema.safeParse(id);
  if (!mediaId.success) return null;
  return (dependencies ?? (await defaultReadDependencies())).get(mediaId.data);
}

const uploadedMediaInputSchema = z
  .object({
    id: z.string().uuid(),
    url: z.string(),
    altEn: z.string().min(1).max(300),
    altZh: z.string().min(1).max(300),
    storageKey: z
      .string()
      .regex(
        /^media\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/,
      ),
    storageEtag: z
      .string()
      .min(1)
      .refine((value) => value.trim() === value),
    originalFilename: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (value) => value.trim() === value && value.normalize("NFC") === value,
      ),
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    byteSize: z.number().int().min(1).max(4_194_304),
    width: z.number().int().min(1).max(10_000),
    height: z.number().int().min(1).max(10_000),
    focalX: z.number().int().min(0).max(100),
    focalY: z.number().int().min(0).max(100),
    checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.url !== `/api/media/${value.id}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "MEDIA_UPLOAD_URL_INVALID",
      });
    }
    if (value.width * value.height > 40_000_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "MEDIA_UPLOAD_PIXELS_INVALID",
      });
    }
  });

export type UploadedMediaInput = z.input<typeof uploadedMediaInputSchema>;

export type MediaUploadMutationDependencies = Readonly<{
  transaction: <T>(
    work: (
      transaction: Readonly<{
        insertMedia: (
          input: z.output<typeof uploadedMediaInputSchema> & {
            registeredByProfileId: string;
          },
        ) => Promise<MediaRow>;
        insertAudit: (input: MediaAudit) => Promise<void>;
      }>,
    ) => Promise<T>,
  ) => Promise<T>;
}>;

async function defaultUploadMutationDependencies(): Promise<MediaUploadMutationDependencies> {
  const db = await getDb();
  return {
    transaction: (work) =>
      db.transaction(async (tx) =>
        work({
          insertMedia: async (input) => {
            const [row] = await tx.insert(media).values(input).returning();
            if (!row) throw new Error("MEDIA_UPLOAD_INSERT_FAILED");
            return row;
          },
          insertAudit: async (input) => {
            await tx.insert(auditEvents).values(input);
          },
        }),
      ),
  };
}

export async function persistUploadedMedia(
  actor: Actor,
  input: unknown,
  dependencies?: MediaUploadMutationDependencies,
): Promise<MediaRow> {
  requireAdmin(actor);
  const parsed = uploadedMediaInputSchema.parse(input);
  return (
    dependencies ?? (await defaultUploadMutationDependencies())
  ).transaction(async (transaction) => {
    const row = await transaction.insertMedia({
      ...parsed,
      registeredByProfileId: actor.profileId,
    });
    await transaction.insertAudit({
      actorUserId: actor.profileId,
      actorType: actor.kind,
      action: "media.uploaded",
      targetType: "media",
      targetId: row.id,
      metadata: {
        storageKey: row.storageKey,
        contentType: row.contentType,
        byteSize: row.byteSize,
        checksumSha256: row.checksumSha256,
      },
    });
    return row;
  });
}

export type UploadedMediaRow = MediaRow &
  Readonly<{
    storageKey: string;
    storageEtag: string;
    originalFilename: string;
    contentType: "image/png" | "image/jpeg" | "image/webp";
    byteSize: number;
    width: number;
    height: number;
    focalX: number;
    focalY: number;
    checksumSha256: string;
  }>;

export type MediaDeliveryReadDependencies = Readonly<{
  getUploaded: (id: string) => Promise<MediaRow | null>;
}>;

async function defaultDeliveryReadDependencies(): Promise<MediaDeliveryReadDependencies> {
  const db = await getDb();
  return {
    getUploaded: async (id) =>
      (
        await db
          .select()
          .from(media)
          .where(
            and(
              eq(media.id, id),
              isNull(media.archivedAt),
              isNotNull(media.storageKey),
              isNotNull(media.storageEtag),
              isNotNull(media.originalFilename),
              isNotNull(media.contentType),
              isNotNull(media.byteSize),
              isNotNull(media.width),
              isNotNull(media.height),
              isNotNull(media.focalX),
              isNotNull(media.focalY),
              isNotNull(media.checksumSha256),
            ),
          )
          .limit(1)
      )[0] ?? null,
  };
}

function completeUploadedMedia(row: MediaRow | null): row is UploadedMediaRow {
  return (
    row !== null &&
    row.archivedAt === null &&
    typeof row.storageKey === "string" &&
    typeof row.storageEtag === "string" &&
    typeof row.originalFilename === "string" &&
    (row.contentType === "image/png" ||
      row.contentType === "image/jpeg" ||
      row.contentType === "image/webp") &&
    typeof row.byteSize === "number" &&
    typeof row.width === "number" &&
    typeof row.height === "number" &&
    typeof row.focalX === "number" &&
    typeof row.focalY === "number" &&
    typeof row.checksumSha256 === "string"
  );
}

export async function getUploadedMediaForDelivery(
  id: unknown,
  dependencies?: MediaDeliveryReadDependencies,
): Promise<UploadedMediaRow | null> {
  const parsed = mediaIdSchema.safeParse(id);
  if (!parsed.success) return null;
  const row = await (
    dependencies ?? (await defaultDeliveryReadDependencies())
  ).getUploaded(parsed.data);
  return completeUploadedMedia(row) ? row : null;
}

export const mediaRepository = {
  create: createMedia,
  update: updateMedia,
  setArchived: setMediaArchived,
  listForAdmin: listMediaForAdmin,
  listActiveForAdmin: listActiveMediaForAdmin,
  getForAdmin: getMediaForAdmin,
  persistUploaded: persistUploadedMedia,
  getUploadedForDelivery: getUploadedMediaForDelivery,
};
