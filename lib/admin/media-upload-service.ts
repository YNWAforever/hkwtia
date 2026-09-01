import "server-only";

import {randomUUID} from "node:crypto";

import {requireAdmin} from "@/lib/auth/authorize";
import {
  persistUploadedMedia,
  type UploadedMediaInput,
} from "@/lib/db/repos/media";
import type {MediaRow} from "@/lib/db/server-schema";
import {
  normalizeImageUpload,
  type ImageUploadFields,
  type MediaContentType,
  type NormalizedImageUpload,
} from "@/lib/media/image-upload";
import {privateR2Storage, type R2Storage} from "@/lib/media/r2-storage";
import type {Actor} from "@/lib/membership/lifecycle";

export type MediaUploadServiceInput = Readonly<{
  bytes: Uint8Array;
  contentType: unknown;
  fields: Readonly<Record<keyof ImageUploadFields, unknown>>;
}>;

export type MediaUploadServiceDependencies = Readonly<{
  normalize: (
    bytes: Uint8Array,
    contentType: unknown,
    fields: Readonly<Record<keyof ImageUploadFields, unknown>>,
  ) => Promise<NormalizedImageUpload>;
  storage: R2Storage;
  persist: (actor: Actor, input: UploadedMediaInput) => Promise<MediaRow>;
  uuid: () => string;
}>;

const defaultDependencies: MediaUploadServiceDependencies = {
  normalize: normalizeImageUpload,
  storage: privateR2Storage,
  persist: persistUploadedMedia,
  uuid: randomUUID,
};

export class MediaUploadServiceError extends Error {
  constructor() {
    super("MEDIA_UPLOAD_FAILED");
    this.name = "MediaUploadServiceError";
  }
}

export async function uploadMedia(
  actor: Actor,
  input: MediaUploadServiceInput,
  dependencies: MediaUploadServiceDependencies = defaultDependencies,
): Promise<MediaRow> {
  // Authorization deliberately precedes normalization, storage configuration,
  // provider access, and database work.
  requireAdmin(actor);
  const normalized = await dependencies.normalize(input.bytes, input.contentType, input.fields);

  try {
    const {etag} = await dependencies.storage.put({
      key: normalized.objectKey,
      bytes: normalized.bytes,
      contentType: normalized.contentType,
      sha256: normalized.sha256,
    });
    const id = dependencies.uuid();
    return await dependencies.persist(actor, {
      id,
      url: `/api/media/${id}`,
      altEn: normalized.altEn,
      altZh: normalized.altZh,
      storageKey: normalized.objectKey,
      storageEtag: etag,
      originalFilename: normalized.filename,
      contentType: normalized.contentType as MediaContentType,
      byteSize: normalized.byteSize,
      width: normalized.width,
      height: normalized.height,
      focalX: normalized.focalX,
      focalY: normalized.focalY,
      checksumSha256: normalized.sha256,
    });
  } catch {
    // The generated key is unique and never user-controlled. A failed Put may
    // still have stored bytes before returning a malformed/missing ETag.
    try { await dependencies.storage.delete(normalized.objectKey); } catch { /* best effort */ }
    throw new MediaUploadServiceError();
  }
}
