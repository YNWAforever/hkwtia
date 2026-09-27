import "server-only";

import {inArray, sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {batchRuntimeConfig} from "@/lib/admin/batches/types";
import {requireAdmin} from "@/lib/auth/authorize";
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import {auditEvents, memberOperationsMetadata, profiles} from "@/lib/db/server-schema";

const profileRowSchema = z.object({id: z.string(), locale: z.enum(["en", "zh-HK"]), role: z.string(), updatedAt: z.string(), tags: z.array(z.string()).default([]), ownerProfileId: z.string().nullable().default(null)});
function textArraySql(values: readonly string[]): SQL {return values.length ? sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]` : sql`ARRAY[]::text[]`;}
function changedFields(before: z.infer<typeof profileRowSchema>, patch: {locale?: "en" | "zh-HK"; tags?: string[]; ownerProfileId?: string | null}) {
  return [patch.locale !== undefined && patch.locale !== before.locale ? "locale" : null, patch.tags !== undefined && JSON.stringify(patch.tags) !== JSON.stringify(before.tags) ? "tags" : null, patch.ownerProfileId !== undefined && patch.ownerProfileId !== before.ownerProfileId ? "ownerProfileId" : null].filter((value): value is string => value !== null);
}
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
      const result = await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.locale} AS locale, ${profiles.role} AS role, ${profiles.updatedAt}::text AS "updatedAt", coalesce(${memberOperationsMetadata.tags}, ARRAY[]::text[]) AS tags, ${memberOperationsMetadata.ownerProfileId} AS "ownerProfileId" FROM ${profiles} LEFT JOIN ${memberOperationsMetadata} ON ${memberOperationsMetadata.profileId} = ${profiles.id} WHERE ${inArray(profiles.id, chunk)}`);
      for (const row of z.array(profileRowSchema).parse(rows(result))) found.set(row.id, row);
    }
    const patch = request.payload.patch;
    const owner = patch.ownerProfileId ? z.array(z.object({role: z.string()})).parse(rows(await tx.execute(sql`SELECT ${profiles.role} AS role FROM ${profiles} WHERE ${profiles.id} = ${patch.ownerProfileId} LIMIT 1`)))[0] : null;
    const ownerValid = !patch.ownerProfileId || owner && ["staff", "exco", "superadmin"].includes(owner.role);
    return ids.map((id) => {
      const row = found.get(id);
      const changes = row ? changedFields(row, patch) : [];
      const reasonCode = !row ? "PROFILE_NOT_FOUND" : row.role !== "member" ? "NOT_MEMBER" : !ownerValid ? "OWNER_NOT_STAFF" : changes.length === 0 ? "UNCHANGED" : null;
      const previewStatus = reasonCode === "UNCHANGED" ? "skipped" as const : reasonCode ? "blocked" as const : "eligible" as const;
      return {target: {type: "profile" as const, id}, previewStatus, eligible: !reasonCode, reasonCode, expectedVersion: row?.updatedAt ?? "missing", before: row ? {locale: row.locale, tags: row.tags, ownerProfileId: row.ownerProfileId} : {}, after: row ? {locale: patch.locale ?? row.locale, tags: patch.tags ?? row.tags, ownerProfileId: patch.ownerProfileId === undefined ? row.ownerProfileId : patch.ownerProfileId} : {}};
    });
  },
  async execute(actor, claim, tx) {
    requireAdmin(actor);
    if (claim.operation !== "profile_patch" || claim.request.operation !== "profile_patch" || claim.target.type !== "profile") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    const patch = claim.request.payload.patch;
    const version = claim.expectedVersion;
    if (!Number.isFinite(Date.parse(version))) return {status: "skipped", reasonCode: "VERSION_CONFLICT"};
    const current = z.array(profileRowSchema).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.locale} AS locale, ${profiles.role} AS role, ${profiles.updatedAt}::text AS "updatedAt", coalesce(${memberOperationsMetadata.tags}, ARRAY[]::text[]) AS tags, ${memberOperationsMetadata.ownerProfileId} AS "ownerProfileId" FROM ${profiles} LEFT JOIN ${memberOperationsMetadata} ON ${memberOperationsMetadata.profileId} = ${profiles.id} WHERE ${profiles.id} = ${claim.target.id} FOR UPDATE OF ${profiles}`)))[0];
    if (!current || current.role !== "member" || current.updatedAt !== version) return {status: "skipped", reasonCode: "VERSION_CONFLICT"};
    const fields = changedFields(current, patch);
    if (!fields.length) return {status: "skipped", reasonCode: "UNCHANGED"};
    if (patch.ownerProfileId) {
      const owner = z.array(z.object({role: z.string()})).parse(rows(await tx.execute(sql`SELECT ${profiles.role} AS role FROM ${profiles} WHERE ${profiles.id} = ${patch.ownerProfileId} LIMIT 1`)))[0];
      if (!owner || !["staff", "exco", "superadmin"].includes(owner.role)) return {status: "skipped", reasonCode: "OWNER_NOT_STAFF"};
    }
    const locale = patch.locale ?? current.locale;
    const result = rows(await tx.execute(sql`UPDATE ${profiles} SET locale = ${locale}, updated_at = now() WHERE ${profiles.id} = ${claim.target.id} AND ${profiles.role} = 'member' AND ${profiles.updatedAt} = ${version}::timestamptz RETURNING ${profiles.id} AS id`));
    if (!result.length) return {status: "skipped", reasonCode: "VERSION_CONFLICT"};
    if (patch.tags !== undefined || patch.ownerProfileId !== undefined) {
      const tags = patch.tags ?? current.tags;
      const owner = patch.ownerProfileId === undefined ? current.ownerProfileId : patch.ownerProfileId;
      await tx.execute(sql`INSERT INTO ${memberOperationsMetadata} (profile_id, tags, owner_profile_id, updated_at) VALUES (${claim.target.id}, ${textArraySql(tags)}, ${owner}, now()) ON CONFLICT (profile_id) DO UPDATE SET tags = EXCLUDED.tags, owner_profile_id = EXCLUDED.owner_profile_id, updated_at = now()`);
    }
    await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'profile.updated', 'profile', ${claim.target.id}, jsonb_build_object('fields', ${JSON.stringify(fields)}::jsonb, 'reason', ${claim.request.payload.reason}::text))`);
    return {status: "succeeded", resultRef: claim.target.id};
  },
};
