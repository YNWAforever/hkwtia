import {downloadEventAttendeeArtifact} from "@/lib/db/repos/batch-handlers/export-event-attendees";
import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {csvCell} from "@/lib/admin/csv";
import {batchRequestSchema} from "@/lib/admin/batches/types";
import {membershipSummaryOrderSql} from "@/lib/admin/membership-summary";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import type {BatchDatabase} from "@/lib/db/repos/admin-batches";
import type {Actor} from "@/lib/membership/lifecycle";

export type MemberBatchExport = Readonly<{csv: string; rowCount: number}>;
const batchIdSchema = z.string().uuid();
const batchRow = z.object({actorProfileId: z.string(), operation: z.string(), state: z.string(), committedAt: z.coerce.date().nullable(), selectionSnapshot: z.unknown()});
const itemRow = z.object({targetId: z.string(), previewStatus: z.string(), state: z.string()});
const memberRow = z.object({profileId: z.string(), displayName: z.string(), email: z.string().nullable(), locale: z.string(), companyName: z.string().nullable(), planCode: z.string().nullable(), membershipStatus: z.string().nullable(), renewalAt: z.coerce.date().nullable()});
type MemberRow = z.infer<typeof memberRow>;
const EXPORT_TTL_MS = 30 * 60_000;
function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
function field(row: MemberRow, key: "displayName" | "email" | "companyName" | "planCode" | "membershipStatus" | "renewalAt" | "locale"): string | null {
  if (key === "renewalAt") return row.renewalAt?.toISOString() ?? null;
  return row[key];
}

/** A private, short-lived view of the frozen target IDs. Values are current at download, never cached in the batch. */
export async function downloadMemberBatchCsv(actor: Actor, batchId: string, loadDatabase: () => Promise<BatchDatabase> = async () => await getDb() as unknown as BatchDatabase, now = new Date()): Promise<MemberBatchExport> {
  requireAdmin(actor);
  const id = batchIdSchema.parse(batchId);
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_EXPORT_TIME");
  if (process.env.MEMBER_EXPORT_ENABLED !== "true" || process.env.ADMIN_BATCH_ENABLED !== "true") throw new Error("EXPORT_UNAVAILABLE");
  const db = await loadDatabase();
  return db.transaction(async (tx) => {
    const rawBatch = rows(await tx.execute(sql`SELECT actor_profile_id AS "actorProfileId", operation, state, committed_at AS "committedAt", selection_snapshot AS "selectionSnapshot" FROM admin_batches WHERE id = ${id}::uuid AND actor_profile_id = ${actor.profileId} LIMIT 1`))[0];
    const batch = rawBatch ? batchRow.parse(rawBatch) : null;
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    if (batch.operation !== "export_members" || batch.state !== "completed") throw new Error("EXPORT_INCOMPLETE");
    if (!batch.committedAt || batch.committedAt.getTime() + EXPORT_TTL_MS <= now.getTime()) throw new Error("EXPORT_EXPIRED");
    const request = batchRequestSchema.parse(batch.selectionSnapshot);
    if (request.operation !== "export_members") throw new Error("EXPORT_REQUEST_MISMATCH");
    const items = z.array(itemRow).parse(rows(await tx.execute(sql`SELECT target_id AS "targetId", preview_status AS "previewStatus", state FROM admin_batch_items WHERE batch_id = ${id}::uuid ORDER BY target_id LIMIT 5001`)));
    if (items.length > 5000) throw new Error("EXPORT_TOO_LARGE");
    const eligible = items.filter((item) => item.previewStatus === "eligible");
    if (eligible.some((item) => item.state !== "succeeded")) throw new Error("EXPORT_INCOMPLETE");
    const ids = eligible.map((item) => item.targetId);
    const found = new Map<string, MemberRow>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const selected = z.array(memberRow).parse(rows(await tx.execute(sql`
        SELECT p.id AS "profileId", p.display_name AS "displayName", p.email, p.locale,
          c.display_name AS "companyName", m.plan_code AS "planCode",
          m.status AS "membershipStatus", m.billing_period_end AS "renewalAt"
        FROM profiles p
        LEFT JOIN LATERAL (
          SELECT m.plan_code, m.status, m.billing_period_end, m.company_id
          FROM memberships m
          WHERE m.owner_user_id = p.id OR m.company_id IN (
            SELECT cm.company_id FROM company_members cm WHERE cm.user_id = p.id AND cm.revoked_at IS NULL
          )
          ORDER BY ${membershipSummaryOrderSql(sql`m.status`)}, m.id, m.company_id NULLS LAST
          LIMIT 1
        ) m ON TRUE
        LEFT JOIN companies c ON c.id = m.company_id
        WHERE p.id IN (${sql.join(chunk.map((value) => sql`${value}`), sql`, `)}) AND p.role = 'member'
      `)));
      for (const row of selected) found.set(row.profileId, row);
    }
    if (found.size !== ids.length) throw new Error("EXPORT_CHANGED");
    const fields = request.payload.fields;
    const lines = [fields.join(","), ...ids.map((profileId) => fields.map((key) => csvCell(field(found.get(profileId)!, key))).join(","))];
    const csv = String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n";
    await tx.execute(sql`INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'admin.batch.export_downloaded', 'admin_batch', ${id}, jsonb_build_object('rowCount', ${ids.length}::int, 'fields', ${JSON.stringify(fields)}::jsonb))`);
    return {csv, rowCount: ids.length};
  }, {isolationLevel: "repeatable read"});
}

/** Dispatch by the actor-owned persisted operation, never a caller-supplied export kind. */
export async function downloadAdminBatchCsv(actor:Actor,batchId:string,loadDatabase:()=>Promise<BatchDatabase>=async()=>await getDb() as unknown as BatchDatabase,now=new Date()):Promise<MemberBatchExport>{
  requireAdmin(actor);batchIdSchema.parse(batchId);
  if(process.env.ADMIN_BATCH_ENABLED!=="true")throw new Error("EXPORT_UNAVAILABLE");
  const db=await loadDatabase();
  const batch=rows(await db.execute(sql`SELECT operation FROM admin_batches WHERE id=${batchId}::uuid AND actor_profile_id=${actor.profileId}`))[0] as {operation:string}|undefined;
  if(!batch)throw new Error("BATCH_NOT_FOUND");
  if(batch.operation==="export_event_attendees")return downloadEventAttendeeArtifact(actor,batchId,async()=>db,now);
  if(batch.operation==="export_members")return downloadMemberBatchCsv(actor,batchId,async()=>db,now);
  throw new Error("EXPORT_INCOMPLETE");
}
