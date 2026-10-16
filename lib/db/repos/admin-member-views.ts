import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {adminMemberQuerySchema} from "@/lib/admin/member-query";
import {type MemberViewRecord, type MemberViewSaveInput, type MemberViewStore} from "@/lib/admin/member-views";
import {requireAdmin} from "@/lib/auth/authorize";
import {adminMemberViews, auditEvents} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";

const rowSchema = z.object({id: z.string().uuid(), ownerProfileId: z.string(), name: z.string(), query: z.unknown(), filterVersion: z.number().int(), shared: z.boolean(), updatedAt: z.coerce.date()});
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
function toRecord(raw: unknown): MemberViewRecord {
  const row = rowSchema.parse(raw);
  if (row.filterVersion !== 1) throw new Error("UNSUPPORTED_MEMBER_VIEW_VERSION");
  const query = adminMemberQuerySchema.parse(row.query);
  if (query.cursor) throw new Error("SAVED_VIEW_CURSOR_INVALID");
  return {id: row.id, ownerProfileId: row.ownerProfileId, name: row.name, query, shared: row.shared, updatedAt: row.updatedAt.toISOString()};
}

export const adminMemberViewsRepository: MemberViewStore = {
  async list(actor) {
    requireAdmin(actor);
    const db = await getDb();
    const result = await db.execute(sql`SELECT ${adminMemberViews.id} AS id, ${adminMemberViews.ownerProfileId} AS "ownerProfileId", ${adminMemberViews.name} AS name, ${adminMemberViews.query} AS query, ${adminMemberViews.filterVersion} AS "filterVersion", ${adminMemberViews.shared} AS shared, ${adminMemberViews.updatedAt} AS "updatedAt" FROM ${adminMemberViews} WHERE ${adminMemberViews.ownerProfileId} = ${actor.profileId} OR ${adminMemberViews.shared} = TRUE ORDER BY ${adminMemberViews.updatedAt} DESC, ${adminMemberViews.id} DESC LIMIT 100`);
    return rows(result).map(toRecord);
  },
  async save(actor, input: MemberViewSaveInput) {
    requireAdmin(actor);
    if (input.shared && actor.kind !== "superadmin") throw new Error("FORBIDDEN");
    const query = adminMemberQuerySchema.parse(input.query);
    if (query.cursor) throw new Error("SAVED_VIEW_CURSOR_INVALID");
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(adminMemberViews).values({ownerProfileId: actor.profileId, name: input.name, filterVersion: 1, query, shared: input.shared}).onConflictDoUpdate({target: [adminMemberViews.ownerProfileId, adminMemberViews.name], set: {query, shared: input.shared, updatedAt: new Date()}}).returning({id: adminMemberViews.id});
      if (!row) throw new Error("MEMBER_VIEW_SAVE_FAILED");
      await tx.insert(auditEvents).values({actorUserId: actor.profileId, actorType: actor.kind, action: "admin.member_view.saved", targetType: "admin_member_view", targetId: row.id, metadata: {shared: input.shared}});
    });
    return input;
  },
};
