"use server";

import {notFound} from "next/navigation";

import {
  runCompMembershipAction,
  type CompMembershipActionState,
} from "@/lib/admin/membership-comp-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {adminMembershipRepository} from "@/lib/db/repos/admin-membership";

export type CompMembershipActionMessages = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
  duplicateMessage: string;
}>;

export async function compMembershipAction(
  path: string,
  messages: CompMembershipActionMessages,
  state: CompMembershipActionState,
  formData: FormData,
): Promise<CompMembershipActionState> {
  try {
    return await runCompMembershipAction(state, formData, {...messages, mutate: async (input) => {
      const actor = await requireAdminActor();
      await adminMembershipRepository.comp(actor, input);
      revalidateAdminPath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
