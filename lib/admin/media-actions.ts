"use server";

import {notFound} from "next/navigation";

import {runMediaFormAction, type MediaActionState} from "@/lib/admin/media-action-core";
import {mediaFormInput} from "@/lib/admin/media-form-input";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {ZodError} from "zod";

import {createMedia, setMediaArchived, updateMedia} from "@/lib/db/repos/media";

// Only the admin path is revalidated. The public surfaces that resolve a
// registry entry — /showcase and /showcase/[slug] — are force-dynamic, so they
// re-read on every request and have no cache entry to invalidate.

export type MediaFormActionMessages = Readonly<{
  successMessage: string;
  urlInvalidMessage: string;
  urlConflictMessage: string;
  validationMessage: string;
  errorMessage: string;
}>;

export async function createMediaAction(
  path: string,
  messages: MediaFormActionMessages,
  state: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  try {
    return await runMediaFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      await createMedia(actor, mediaFormInput(data));
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function updateMediaAction(
  mediaId: string,
  path: string,
  messages: MediaFormActionMessages,
  state: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  try {
    return await runMediaFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      const updated = await updateMedia(actor, mediaId, mediaFormInput(data));
      if (!updated) throw new Error("MEDIA_NOT_FOUND");
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export type MediaArchiveActionState = Readonly<{
  status: "idle" | "success" | "invalid" | "inUse" | "error";
  listings?: number;
}>;

/**
 * Archiving is refused while a showcase listing still points at the image, so
 * retiring one is never a silent change to something already published. The
 * count comes back so staff can be told how many listings to detach.
 */
export async function setMediaArchivedAction(
  mediaId: string,
  path: string,
  archived: boolean,
  state: MediaArchiveActionState,
  formData: FormData,
): Promise<MediaArchiveActionState> {
  void state;
  void formData;
  try {
    const actor = await requireAdminActor();
    const entry = await setMediaArchived(actor, mediaId, archived);
    if (!entry) return {status: "invalid"};
    revalidateAdminPath(path);
    return {status: "success"};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    if (error instanceof ZodError) {
      const issue = error.issues.find((candidate) => candidate.message === "MEDIA_IN_USE");
      if (issue) {
        const listings = (issue as {params?: {listings?: number}}).params?.listings ?? 0;
        return {status: "inUse", listings};
      }
      return {status: "invalid"};
    }
    return {status: "error"};
  }
}
