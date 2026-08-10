"use server";

import {notFound} from "next/navigation";
import {z} from "zod";

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {updateMemberProfile} from "@/lib/db/repos/admin-member-profile";

export type MemberProfileActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

export type MemberProfileActionMessages = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
}>;

/** Explicit allowlist: only these are ever echoed back to the browser. */
const preservedFields = ["displayName", "phone", "jobTitle", "locale"] as const;

export async function updateMemberProfileAction(
  profileId: string,
  path: string,
  messages: MemberProfileActionMessages,
  _state: MemberProfileActionState,
  formData: FormData,
): Promise<MemberProfileActionState> {
  const values = Object.fromEntries(
    preservedFields.map((name) => [name, String(formData.get(name) ?? "")]),
  );
  try {
    const actor = await requireAdminActor();
    const updated = await updateMemberProfile(actor, profileId, {
      displayName: String(formData.get("displayName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      jobTitle: String(formData.get("jobTitle") ?? ""),
      locale: String(formData.get("locale") ?? ""),
    });
    if (!updated) return {status: "error", message: messages.errorMessage, values};
    revalidateAdminPath(path);
    return {status: "success", message: messages.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    if (error instanceof z.ZodError) {
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) =>
        typeof issue.path[0] === "string" ? [[issue.path[0], messages.validationMessage]] : []));
      return {status: "error", message: messages.validationMessage, fieldErrors, values};
    }
    return {status: "error", message: messages.errorMessage, values};
  }
}
