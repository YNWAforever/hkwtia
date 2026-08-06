"use server";

import {notFound} from "next/navigation";

import {runMediaFormAction, type MediaActionState} from "@/lib/admin/media-action-core";
import {mediaFormInput} from "@/lib/admin/media-form-input";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {createMedia, updateMedia} from "@/lib/db/repos/media";

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
