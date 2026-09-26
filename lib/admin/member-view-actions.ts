"use server";

import {notFound} from "next/navigation";
import {ZodError} from "zod";

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {saveMemberView} from "@/lib/admin/member-views";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {adminMemberViewsRepository} from "@/lib/db/repos/admin-member-views";

export type MemberViewActionState = Readonly<{status: "idle" | "saved" | "invalid" | "error"}>;

export async function saveMemberViewAction(_state: MemberViewActionState, formData: FormData): Promise<MemberViewActionState> {
  let actor;
  try { actor = await requireAdminActor(); }
  catch (error) { if (isAuthorizationDenial(error)) notFound(); throw error; }
  const name = formData.get("name");
  const rawQuery = formData.get("query");
  if (typeof name !== "string" || typeof rawQuery !== "string" || rawQuery.length > 4000) return {status: "invalid"};
  let query: unknown;
  try { query = JSON.parse(rawQuery); }
  catch { return {status: "invalid"}; }
  try {
    await saveMemberView(actor, {name, query, shared: formData.get("shared") === "on"}, adminMemberViewsRepository);
    revalidateAdminPath("/en/admin/members");
    revalidateAdminPath("/zh-HK/admin/members");
    return {status: "saved"};
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    if (error instanceof ZodError) return {status: "invalid"};
    return {status: "error"};
  }
}
