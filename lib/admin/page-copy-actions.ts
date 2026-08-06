"use server";

import {notFound} from "next/navigation";

import {
  runPageCopyFormAction,
  type PageCopyActionState,
} from "@/lib/admin/page-copy-action-core";
import {pageCopyFormInput} from "@/lib/admin/page-copy-form-input";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {revalidatePublicRoute} from "@/lib/admin/revalidate-public-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {savePageCopy} from "@/lib/db/repos/page-copy";
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
      // Both locales are edited in one form and saved in one transaction, but
      // stored per locale so English can be overridden while Chinese still
      // falls back to its bundle value.
      const result = await savePageCopy(actor, pageCopyFormInput(namespace, data));
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
