"use server";

import {notFound} from "next/navigation";
import {ZodError} from "zod";

import {parseProfileGrantForm} from "@/lib/admin/membership-grant-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {grantMembership} from "@/lib/db/repos/membership-grants";

export type GrantActionState = Readonly<{status?: "success" | "error"; message?: string}>;
export type GrantActionMessages = Readonly<{success: string; invalid: string; duplicate: string; error: string}>;

export async function grantMembershipAction(profileId: string, path: string, messages: GrantActionMessages, _state: GrantActionState, formData: FormData): Promise<GrantActionState> {
  try {
    const actor = await requireAdminActor();
    if (actor.kind !== "superadmin") notFound();
    const input = parseProfileGrantForm(profileId, formData);
    await grantMembership(actor, input);
    revalidateAdminPath(path);
    return {status: "success", message: messages.success};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    if (error instanceof ZodError || error instanceof Error && error.message === "GRANT_DATE_INVALID") return {status: "error", message: messages.invalid};
    if (error instanceof Error && error.message === "MEMBERSHIP_ALREADY_EXISTS") return {status: "error", message: messages.duplicate};
    return {status: "error", message: messages.error};
  }
}
