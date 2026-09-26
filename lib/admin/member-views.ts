import {z} from "zod";

import {adminMemberQuerySchema} from "@/lib/admin/member-query";
import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

export const memberViewSaveSchema = z.object({
  name: z.string().trim().min(1).max(80),
  query: adminMemberQuerySchema,
  shared: z.boolean().default(false),
}).strict().superRefine(({query}, context) => {
  if (query.cursor) context.addIssue({code: z.ZodIssueCode.custom, path: ["query", "cursor"], message: "CURSOR_NOT_A_SAVED_FILTER"});
});
export type MemberViewSaveInput = z.infer<typeof memberViewSaveSchema>;
export type MemberViewRecord = Readonly<{id: string; ownerProfileId: string; name: string; query: MemberViewSaveInput["query"]; shared: boolean; updatedAt: string}>;
export type MemberViewStore = Readonly<{
  save: (actor: AdminActor, input: MemberViewSaveInput) => Promise<MemberViewSaveInput>;
  list: (actor: AdminActor) => Promise<readonly MemberViewRecord[]>;
}>;

export async function saveMemberView(actor: Actor, input: unknown, store: MemberViewStore): Promise<MemberViewSaveInput> {
  requireAdmin(actor);
  const parsed = memberViewSaveSchema.parse(input);
  if (parsed.shared && actor.kind !== "superadmin") throw new Error("FORBIDDEN");
  return store.save(actor, parsed);
}

export async function listMemberViews(actor: Actor, store: MemberViewStore): Promise<readonly MemberViewRecord[]> {
  requireAdmin(actor);
  return store.list(actor);
}
