"use server";

import {notFound} from "next/navigation";

import {runNewsFormAction, type NewsActionState} from "@/lib/admin/news-action-core";
import {newsFormInput} from "@/lib/admin/news-form-input";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {createNewsPost, getNewsForAdmin, updateNewsPost} from "@/lib/db/repos/admin-posts";
import {revalidatePublicNews} from "@/lib/news/revalidate";

export type NewsFormActionMessages = Readonly<{
  successMessage: string;
  validationMessage: string;
  slugConflictMessage: string;
  errorMessage: string;
}>;

export async function createNewsAction(
  path: string,
  messages: NewsFormActionMessages,
  state: NewsActionState,
  formData: FormData,
): Promise<NewsActionState> {
  try {
    return await runNewsFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      const post = await createNewsPost(actor, newsFormInput(data));
      revalidateAdminPath(path);
      revalidatePublicNews(post.slug);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function updateNewsAction(
  postId: string,
  path: string,
  messages: NewsFormActionMessages,
  state: NewsActionState,
  formData: FormData,
): Promise<NewsActionState> {
  try {
    return await runNewsFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      // Read the current publication instant first so re-saving a published
      // post keeps its original timestamp instead of bumping it to now.
      const current = await getNewsForAdmin(actor, postId);
      if (!current) throw new Error("NEWS_POST_NOT_FOUND");
      const updated = await updateNewsPost(
        actor, postId, newsFormInput(data, current.publishedAt),
      );
      if (!updated) throw new Error("NEWS_POST_NOT_FOUND");
      revalidateAdminPath(path);
      revalidatePublicNews(updated.slug, current.slug);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
