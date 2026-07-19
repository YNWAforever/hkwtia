import "server-only";

import {adminMemberQuerySchema, type AdminMemberPage, type AdminMemberQuery} from "@/lib/admin/member-types";
import {requireAdmin} from "@/lib/auth/actor";
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

export type AdminMemberReader = Readonly<{search: (actor: AdminActor, query: AdminMemberQuery) => Promise<AdminMemberPage>}>;

export async function searchAdminMembers(actor: Actor, input: unknown, repository: AdminMemberReader = adminMembersRepository): Promise<AdminMemberPage> {
  requireAdmin(actor);
  return repository.search(actor, adminMemberQuerySchema.parse(input));
}
