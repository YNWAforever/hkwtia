"use server";

import {notFound} from "next/navigation";

import {
  runAnnouncementFormAction,
  type AnnouncementActionState,
} from "@/lib/admin/announcement-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {revalidatePublicRoute} from "@/lib/admin/revalidate-public-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {
  createAnnouncement,
  setAnnouncementArchived,
  setAnnouncementPublished,
  updateAnnouncement,
} from "@/lib/db/repos/announcements";

export type AnnouncementFormActionMessages = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
}>;

function revalidateAnnouncementPaths(path: string): void {
  revalidateAdminPath(path);
  // PR4 keeps the layout on announcement={null}, but invalidates the future
  // public root boundary so activation never needs a cache-policy rewrite.
  revalidatePublicRoute("/");
}

export async function createAnnouncementAction(
  path: string,
  messages: AnnouncementFormActionMessages,
  state: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  try {
    const actor = await requireAdminActor();
    return await runAnnouncementFormAction(state, formData, {
      ...messages,
      mutate: async (input) => {
        await createAnnouncement(actor, input);
        revalidateAnnouncementPaths(path);
      },
    });
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function updateAnnouncementAction(
  announcementId: string,
  path: string,
  messages: AnnouncementFormActionMessages,
  state: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  try {
    const actor = await requireAdminActor();
    return await runAnnouncementFormAction(state, formData, {
      ...messages,
      mutate: async (input) => {
        const row = await updateAnnouncement(actor, announcementId, input);
        if (!row) throw new Error("ANNOUNCEMENT_NOT_FOUND");
        revalidateAnnouncementPaths(path);
      },
    });
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export type AnnouncementLifecycleActionState = Readonly<{
  status: "idle" | "success" | "invalid" | "error";
}>;

export async function setAnnouncementPublishedAction(
  announcementId: string,
  path: string,
  published: boolean,
  state: AnnouncementLifecycleActionState,
  formData: FormData,
): Promise<AnnouncementLifecycleActionState> {
  void state;
  void formData;
  try {
    const actor = await requireAdminActor();
    const row = await setAnnouncementPublished(actor, announcementId, published);
    if (!row) return {status: "invalid"};
    revalidateAnnouncementPaths(path);
    return {status: "success"};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    return {status: "error"};
  }
}

export async function setAnnouncementArchivedAction(
  announcementId: string,
  path: string,
  archived: boolean,
  state: AnnouncementLifecycleActionState,
  formData: FormData,
): Promise<AnnouncementLifecycleActionState> {
  void state;
  void formData;
  try {
    const actor = await requireAdminActor();
    const row = await setAnnouncementArchived(actor, announcementId, archived);
    if (!row) return {status: "invalid"};
    revalidateAnnouncementPaths(path);
    return {status: "success"};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    return {status: "error"};
  }
}
