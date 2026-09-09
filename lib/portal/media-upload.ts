import "server-only";

import {randomUUID} from "node:crypto";

import {createMediaUploadPost} from "@/lib/admin/media-upload-route";
import {
  runMediaUploadPipeline,
  type MediaUploadServiceDependencies,
  type MediaUploadServiceInput,
} from "@/lib/admin/media-upload-service";
import {mediaRepository} from "@/lib/db/repos/media";
import type {MediaRow} from "@/lib/db/server-schema";
import {normalizeImageUpload} from "@/lib/media/image-upload";
import {privateR2Storage} from "@/lib/media/r2-storage";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";

/**
 * Programme S-3: a member uploads an event hero through the same normalise →
 * store → persist pipeline staff use, but behind a member gate and with a
 * persist that records the *member* as `registered_by_profile_id`. That stamp
 * is the ownership `lib/db/repos/events.ts` later checks before the row may be
 * attached as a hero. The pipeline itself is actor-free, so nothing here ever
 * has to borrow a staff-shaped actor to get past the admin service's gate.
 */
const defaultDependencies: MediaUploadServiceDependencies = {
  normalize: normalizeImageUpload,
  storage: privateR2Storage,
  persist: mediaRepository.persistMemberUploaded,
  uuid: randomUUID,
};

export async function uploadMemberMedia(
  actor: Actor,
  input: MediaUploadServiceInput,
  dependencies: MediaUploadServiceDependencies = defaultDependencies,
): Promise<MediaRow> {
  // Authorization deliberately precedes normalization, storage configuration,
  // provider access, and database work — the same ordering as the admin path.
  requireMember(actor);
  return runMediaUploadPipeline(input, {
    normalize: dependencies.normalize,
    storage: dependencies.storage,
    uuid: dependencies.uuid,
    persist: (row) => dependencies.persist(actor, row),
  });
}

/**
 * The admin route factory with its gate swapped for requireMember: a visitor,
 * and staff too, get the same 404 the admin route gives non-staff. Origin
 * checking, the bounded body read, the query fields and the 201 shape are the
 * factory's and unchanged.
 */
export function createMemberMediaUploadPost(options: Readonly<{
  actor: () => Promise<Actor>;
  expectedOrigin: () => string;
  upload: (actor: Actor, input: MediaUploadServiceInput) => Promise<Pick<MediaRow, "id" | "url">>;
}>) {
  return createMediaUploadPost({...options, authorize: requireMember});
}
