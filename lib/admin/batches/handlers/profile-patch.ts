import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {batchRuntimeConfig} from "@/lib/admin/batches/types";
import {requireAdmin} from "@/lib/auth/authorize";
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import {auditEvents, profiles} from "@/lib/db/server-schema";

const profileRowSchema = z.object({id: z.string(), locale: z.enum(["en", "zh-HK"]), role: z.string(), updatedAt: z.string()});
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

export const profilePatchBatchHandler: BatchOperationHandler = {
  async prepare(actor, request, tx) {
    requireAdmin(actor);
    if (request.operation !== "profile_patch") throw new Error("BATCH_OPERATION_MISMATCH");
    const selection = request.selection;
    let ids: string[];
    if (selection.mode === "ids") ids = [...selection.profileIds];
    else {
      ids = [];
      const excluded = new Set(selection.excludedProfileIds);
      let cursor: string | null = null;
      for (;;) {
        const page = await adminMembersRepository.search(actor, {...selection.query, cursor, limit: 50}, tx);
        if (page.totalMatching > batchRuntimeConfig().maxItems) throw new Error("BATCH_TOO_LARGE");
        ids.push(...page.items.map((item) => item.profileId).filter((id) => !excluded.has(id)));
        if (ids.length > batchRuntimeConfig().maxItems) throw new Error("BATCH_TOO_LARGE");
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
    }
    const found = new Map<string, z.infer<typeof profileRowSchema>>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const result = await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.locale} AS locale, ${profiles.role} AS role, ${profiles.updatedAt}::text AS "updatedAt" FROM ${profiles} WHERE ${inArray(profiles.id, chunk)}`);
      for (const row of z.array(profileRowSchema).parse(rows(result))) found.set(row.id, row);
    }
    const locale = request.payload.patch.locale;
    if (!locale) throw new Error("BATCH_PATCH_UNAVAILABLE");
    return ids.map((id) => {
      const row = found.get(id);
      const previewStatus = !row || row.role !== "member" ? "blocked" : row.locale === locale ? "skipped" : "eligible";
      const reasonCode = !row ? "PROFILE_NOT_FOUND" : row.role !== "member" ? "NOT_MEMBER" : row.locale === locale ? "UNCHANGED" : null;
      return {target: {type: "profile" as const, id}, previewStatus, eligible: previewStatus === "eligible", reasonCode, expectedVersion: row?.updatedAt ?? "missing", before: row ? {locale: row.locale} : {}, after: row ? {locale} : {}};
    });
  },
  async execute(actor, claim, tx) {
    requireAdmin(actor);
    if (claim.operation !== "profile_patch" || claim.request.operation !== "profile_patch" || claim.target.type !== "profile") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    const locale = claim.request.payload.patch.locale;
    if (!locale) return {status: "failed", errorCode: "BATCH_PATCH_UNAVAILABLE"};
    const version = claim.expectedVersion;
    if (!Number.isFinite(Date.parse(version))) return {status: "skipped", reasonCode: "VERSION_CONFLICT"};
    const result = rows(await tx.execute(sql`UPDATE ${profiles} SET locale = ${locale}, updated_at = now() WHERE ${profiles.id} = ${claim.target.id} AND ${profiles.role} = 'member' AND ${profiles.updatedAt} = ${version}::timestamptz AND ${profiles.locale} IS DISTINCT FROM ${locale} RETURNING ${profiles.id} AS id`));
    if (!result.length) return {status: "skipped", reasonCode: "VERSION_CONFLICT"};
    await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'profile.updated', 'profile', ${claim.target.id}, jsonb_build_object('fields', jsonb_build_array('locale')))`);
    return {status: "succeeded", resultRef: claim.target.id};
  },
};
