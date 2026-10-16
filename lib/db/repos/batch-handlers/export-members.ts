import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import {resolveMemberSelectionIds} from "@/lib/admin/batches/selection";
import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {profiles} from "@/lib/db/server-schema";

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
const profileRow = z.object({id: z.string(), role: z.string()});
export const exportMembersBatchHandler: BatchOperationHandler = {
  async prepare(actor, request, tx) {
    if (request.operation !== "export_members") throw new Error("BATCH_OPERATION_MISMATCH");
    const ids = await resolveMemberSelectionIds(actor, request.selection, tx);
    const found = new Map<string, string>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const result = z.array(profileRow).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role FROM ${profiles} WHERE ${inArray(profiles.id, chunk)}`)));
      for (const row of result) found.set(row.id, row.role);
    }
    return ids.map((id) => {
      const role = found.get(id);
      const reasonCode = !role ? "PROFILE_NOT_FOUND" : role !== "member" ? "NOT_MEMBER" : null;
      return {target: {type: "profile" as const, id}, previewStatus: reasonCode ? "blocked" as const : "eligible" as const, eligible: !reasonCode, reasonCode, expectedVersion: role ?? "missing", before: {profileId: id}, after: {fields: request.payload.fields}};
    });
  },
  async execute(_actor, claim, tx) {
    if (claim.operation !== "export_members" || claim.request.operation !== "export_members" || claim.target.type !== "profile") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    if (process.env.MEMBER_EXPORT_ENABLED !== "true") return {status: "skipped", reasonCode: "MEMBER_EXPORT_DISABLED"};
    const row = z.array(profileRow).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role FROM ${profiles} WHERE ${profiles.id} = ${claim.target.id} FOR SHARE`)))[0];
    if (!row || row.role !== "member") return {status: "skipped", reasonCode: "PROFILE_NOT_MEMBER"};
    return {status: "succeeded", resultRef: row.id};
  },
};
