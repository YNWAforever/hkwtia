"use server";

import {notFound} from "next/navigation";
import {z} from "zod";

import {
  runPageCopyFormAction,
  type PageCopyActionState,
} from "@/lib/admin/page-copy-action-core";
import {pageCopyFormInput} from "@/lib/admin/page-copy-form-input";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {revalidatePublicRoute} from "@/lib/admin/revalidate-public-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {saveCopyDraft, publishCopyDraft, restoreCopyPublication, savePageCopy} from "@/lib/db/repos/page-copy";
import {clearPageCopyCache} from "@/lib/i18n/page-copy-cache";
import {
  isPageCopyNamespace,
  pageCopyRoutes,
  type PageCopyNamespace,
} from "@/lib/i18n/page-copy-scope";

export type PageCopyFormActionMessages = Readonly<{
  successMessage: string;
  unchangedMessage: string;
  validationMessage: string;
  errorMessage: string;
  conflictMessage: string;
}>;

export async function savePageCopyAction(
  namespaceValue: string,
  path: string,
  messages: PageCopyFormActionMessages,
  state: PageCopyActionState,
  formData: FormData,
): Promise<PageCopyActionState> {
  // The namespace is a bound argument, so it is client-supplied like the path.
  if (!isPageCopyNamespace(namespaceValue)) notFound();
  const namespace: PageCopyNamespace = namespaceValue;
  try {
    return await runPageCopyFormAction(state, formData, {...messages, mutate: async (data) => {
      const actor = await requireAdminActor();
      if (process.env.CMS_SERVER_DRAFTS_ENABLED === "true") throw new Error("CMS_DRAFT_REQUIRED");
      // Both locales are edited in one form and saved in one transaction, but
      // stored per locale so English can be overridden while Chinese still
      // falls back to its bundle value.
      const revision = z.string().regex(/^[a-f0-9]{64}$/).parse(data.get("revision"));
      const result = await savePageCopy(actor, {...pageCopyFormInput(namespace, data), revision});
      if (result.updated || result.cleared) {
        clearPageCopyCache();
        for (const route of pageCopyRoutes[namespace]) revalidatePublicRoute(route);
      }
      revalidateAdminPath(path);
      return result;
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function workspacePageCopyAction(
  namespaceValue: string,
  path: string,
  messages: PageCopyFormActionMessages &
    Readonly<{ draftSaved: string; published: string; restored: string }>,
  state: PageCopyActionState,
  formData: FormData,
): Promise<PageCopyActionState> {
  // Bound values and every submitted revision remain untrusted.
  if (!isPageCopyNamespace(namespaceValue)) notFound();
  let extra: Partial<PageCopyActionState> = {};
  try {
    const actor = await requireAdminActor();
    const result = await runPageCopyFormAction(state, formData, {
      ...messages,
      mutate: async (data) => {
        const intent = z
          .enum(["draft", "publish", "restore", "rebase"])
          .parse(data.get("intent") ?? "draft");
        const publishedRevision = z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(data.get("revision"));
        const expectedDraftRevision = data.get("draftRevision")
          ? z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(data.get("draftRevision"))
          : null;
        if (intent === "restore") {
          const draft = await restoreCopyPublication(actor, {
            publicationId: data.get("publicationId"),
            expectedPublishedRevision: publishedRevision,
            expectedDraftRevision,
            previous: data.get("restorePrevious") === "yes",
          });
          const { readPrivateCopyDraft } =
            await import("@/lib/db/repos/page-copy");
          const row = await readPrivateCopyDraft(actor, draft.draftId);
          extra = {
            draftId: draft.draftId,
            draftRevision: draft.revision,
            intent,
            values: Object.fromEntries(
              row.entries.map((entry) => [
                `copy:${entry.locale}:${entry.keyPath}`,
                entry.value,
              ]),
            ),
          };
          return { updated: 1, cleared: 0, revision: draft.publishedRevision };
        }
        const entries = pageCopyFormInput(namespaceValue, data).entries;
        const draft = await saveCopyDraft(actor, {
          namespace: namespaceValue,
          baseRevision: publishedRevision,
          expectedDraftRevision,
          rebase: intent === "rebase",
          changes: Object.fromEntries(
            entries.map((entry) => [
              `${entry.locale}:${entry.keyPath}`,
              entry.value,
            ]),
          ),
        });
        if (intent === "publish") {
          const published = await publishCopyDraft(actor, {
            draftId: draft.draftId,
            expectedDraftRevision: draft.revision,
            expectedPublishedRevision: publishedRevision,
          });
          clearPageCopyCache();
          for (const route of pageCopyRoutes[namespaceValue])
            revalidatePublicRoute(route);
          extra = { draftId: null, draftRevision: null, intent };
          return published;
        }
        extra = {
          draftId: draft.draftId,
          draftRevision: draft.revision,
          intent,
        };
        if (intent === "rebase") {
          const { readPrivateCopyDraft } =
            await import("@/lib/db/repos/page-copy");
          const row = await readPrivateCopyDraft(actor, draft.draftId);
          extra = {
            ...extra,
            values: Object.fromEntries(
              row.entries.map((entry) => [
                `copy:${entry.locale}:${entry.keyPath}`,
                entry.value,
              ]),
            ),
          };
        }
        return { updated: 1, cleared: 0, revision: draft.publishedRevision };
      },
    });
    if (result.status === "success") {
      revalidateAdminPath(path);
      return {
        ...result,
        ...extra,
        message:
          extra.intent === "publish"
            ? messages.published
            : extra.intent === "restore"
              ? messages.restored
              : messages.draftSaved,
      };
    }
    return result;
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
