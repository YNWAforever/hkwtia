import "server-only";

import {createHash} from "node:crypto";
import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import {batchPreviewDigest} from "@/lib/admin/batches/types";
import {matchMemberImportRow, type ImportMatchFacts, type MatchedImportRow} from "@/lib/admin/imports/match";
import {parseMemberImport, type ParsedMemberImport} from "@/lib/admin/imports/parse";
import {validateMemberImportRows, type ImportMapping} from "@/lib/admin/imports/validate";
import type {ImportGateway, ImportRunSummary} from "@/lib/admin/imports/service";
import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, memberImportRows, memberImportRuns, memberImportUploads, memberOperationsMetadata, profiles, contacts} from "@/lib/db/server-schema";
import {getDb} from "@/lib/db/repos/common";
import type {AdminActor} from "@/lib/membership/lifecycle";
import type {BatchDatabase, BatchExecutor} from "@/lib/db/repos/admin-batches";

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows;
  return [];
}
function first(result: unknown): unknown {return rows(result)[0];}
const uploadSchema = z.object({id: z.string().uuid(), fileDigest: z.string(), parsedSnapshot: z.object({headers: z.array(z.string()), rows: z.array(z.object({rowNumber: z.number().int(), cells: z.record(z.string())}))}), expiresAt: z.coerce.date()});
const runSchema = z.object({id: z.string().uuid(), state: z.enum(["validated", "confirmed", "committed", "expired"]), summary: z.record(z.number()), expiresAt: z.coerce.date()});
const profileFactSchema = z.object({id: z.string(), role: z.string(), email: z.string().nullable(), locale: z.string(), updatedAt: z.string(), tags: z.array(z.string()).default([]), ownerProfileId: z.string().nullable()});
const emailRow = z.object({id: z.string(), email: z.string()});
const ownerRow = z.object({id: z.string(), role: z.string()});
function summary(runId: string, state: string, counts: Record<string, number>): ImportRunSummary {
  return {runId, state, total: counts.total ?? 0, create: counts.create ?? 0, update: counts.update ?? 0, unchanged: counts.unchanged ?? 0, duplicate: counts.duplicate ?? 0, conflict: counts.conflict ?? 0, invalid: counts.invalid ?? 0};
}
function groupByEmail(values: readonly z.infer<typeof emailRow>[]) {
  const result = new Map<string, string[]>();
  for (const row of values) result.set(row.email, [...(result.get(row.email) ?? []), row.id]);
  return result;
}
async function matchRows(tx: BatchExecutor, parsed: ParsedMemberImport, mapping: ImportMapping): Promise<MatchedImportRow[]> {
  const validated = validateMemberImportRows(parsed, mapping);
  const profileIds = [...new Set(validated.map((row) => row.values.profileId).filter((value): value is string => typeof value === "string"))];
  const emails = [...new Set(validated.map((row) => row.values.email).filter((value): value is string => typeof value === "string"))];
  const ownerIds = [...new Set(validated.map((row) => row.values.ownerProfileId).filter((value): value is string => typeof value === "string"))];
  const profileRows = profileIds.length ? z.array(profileFactSchema).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role, ${profiles.email} AS email, ${profiles.locale} AS locale, ${profiles.updatedAt}::text AS "updatedAt", coalesce(${memberOperationsMetadata.tags}, ARRAY[]::text[]) AS tags, ${memberOperationsMetadata.ownerProfileId} AS "ownerProfileId" FROM ${profiles} LEFT JOIN ${memberOperationsMetadata} ON ${memberOperationsMetadata.profileId} = ${profiles.id} WHERE ${inArray(profiles.id, profileIds)}`))) : [];
  const existingProfiles = emails.length ? z.array(emailRow).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, lower(${profiles.email}) AS email FROM ${profiles} WHERE ${inArray(sql`lower(${profiles.email})`, emails)}`))) : [];
  const existingContacts = emails.length ? z.array(emailRow).parse(rows(await tx.execute(sql`SELECT ${contacts.id}::text AS id, lower(${contacts.email}) AS email FROM ${contacts} WHERE ${inArray(sql`lower(${contacts.email})`, emails)}`))) : [];
  const owners = ownerIds.length ? z.array(ownerRow).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role FROM ${profiles} WHERE ${inArray(profiles.id, ownerIds)}`))) : [];
  const byId = new Map(profileRows.map((row) => [row.id, row]));
  const profilesByEmail = groupByEmail(existingProfiles);
  const contactsByEmail = groupByEmail(existingContacts);
  const ownerRoles = new Map(owners.map((row) => [row.id, row.role]));
  return validated.map((row) => {
    const values = row.values;
    const email = typeof values.email === "string" ? values.email : "";
    const facts: ImportMatchFacts = {profile: byId.get(String(values.profileId ?? "")) ?? null, emailProfileIds: profilesByEmail.get(email) ?? [], emailContactIds: contactsByEmail.get(email) ?? [], ownerRole: ownerRoles.get(String(values.ownerProfileId ?? "")) ?? null};
    return matchMemberImportRow(row, facts);
  });
}

export type ImportRunDetail = Readonly<{summary: ImportRunSummary; rows: readonly MatchedImportRow[]}>;
export function createMemberImportRepository(loadDatabase: () => Promise<BatchDatabase> = async () => await getDb() as unknown as BatchDatabase, now: () => Date = () => new Date()): ImportGateway & Readonly<{read: (actor: AdminActor, runId: string) => Promise<ImportRunDetail>}> {
  return {
    async upload(actor, bytes, format) {
      requireAdmin(actor);
      const parsed = await parseMemberImport(bytes, format);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const db = await loadDatabase();
      const uploaded = z.object({id: z.string().uuid()}).parse(first(await db.execute(sql`INSERT INTO ${memberImportUploads} (actor_profile_id, file_digest, format, parsed_snapshot, row_count, expires_at) VALUES (${actor.profileId}, ${digest}, ${format}, ${JSON.stringify(parsed)}::jsonb, ${parsed.rows.length}, ${new Date(now().getTime() + 7 * 86_400_000)}) RETURNING ${memberImportUploads.id} AS id`)));
      // Original bytes are never persisted. The private parsed snapshot is time-bounded.
      return {uploadId: uploaded.id, headers: parsed.headers, rowCount: parsed.rows.length};
    },
    async validate(actor, uploadId, mapping) {
      requireAdmin(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const upload = uploadSchema.parse(first(await tx.execute(sql`SELECT ${memberImportUploads.id} AS id, ${memberImportUploads.fileDigest} AS "fileDigest", ${memberImportUploads.parsedSnapshot} AS "parsedSnapshot", ${memberImportUploads.expiresAt} AS "expiresAt" FROM ${memberImportUploads} WHERE ${memberImportUploads.id} = ${uploadId}::uuid AND ${memberImportUploads.actorProfileId} = ${actor.profileId} FOR UPDATE`)));
        if (upload.expiresAt.getTime() <= now().getTime()) throw new Error("IMPORT_UPLOAD_EXPIRED");
        const digest = batchPreviewDigest(mapping);
        const existing = first(await tx.execute(sql`SELECT ${memberImportRuns.id} AS id, ${memberImportRuns.state} AS state, ${memberImportRuns.summary} AS summary, ${memberImportRuns.expiresAt} AS "expiresAt" FROM ${memberImportRuns} WHERE ${memberImportRuns.actorProfileId} = ${actor.profileId} AND ${memberImportRuns.fileDigest} = ${upload.fileDigest} AND ${memberImportRuns.mappingDigest} = ${digest} LIMIT 1`));
        if (existing) {const run = runSchema.parse(existing); if (run.expiresAt.getTime() <= now().getTime()) throw new Error("IMPORT_RUN_EXPIRED"); return summary(run.id, run.state, run.summary);}
        const matched = await matchRows(tx, upload.parsedSnapshot, mapping);
        const counts: Record<string, number> = {total: matched.length, create: 0, update: 0, unchanged: 0, duplicate: 0, conflict: 0, invalid: 0};
        for (const row of matched) counts[row.status] = (counts[row.status] ?? 0) + 1;
        const run = z.object({id: z.string().uuid()}).parse(first(await tx.execute(sql`INSERT INTO ${memberImportRuns} (upload_id, actor_profile_id, file_digest, mapping_digest, mapping, state, summary, expires_at) VALUES (${uploadId}::uuid, ${actor.profileId}, ${upload.fileDigest}, ${digest}, ${JSON.stringify(mapping)}::jsonb, 'validated', ${JSON.stringify(counts)}::jsonb, ${new Date(now().getTime() + 30 * 86_400_000)}) RETURNING ${memberImportRuns.id} AS id`)));
        const records = matched.map((row) => ({row_number: row.rowNumber, validated_payload: row.values, before_snapshot: row.before, validation_status: row.status, match_target_id: row.targetId, expected_version: row.expectedVersion, conflict_reason: row.reason}));
        if (records.length) await tx.execute(sql`INSERT INTO ${memberImportRows} (run_id, row_number, validated_payload, before_snapshot, validation_status, match_target_id, expected_version, conflict_reason) SELECT ${run.id}::uuid, value.row_number, value.validated_payload, value.before_snapshot, value.validation_status, value.match_target_id, value.expected_version, value.conflict_reason FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS value(row_number integer, validated_payload jsonb, before_snapshot jsonb, validation_status text, match_target_id text, expected_version text, conflict_reason text)`);
        await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'member.import.validated', 'member_import_run', ${run.id}, jsonb_build_object('rows', ${matched.length}::int))`);
        return summary(run.id, "validated", counts);
      }, {isolationLevel: "repeatable read"});
    },
    async confirm(actor, runId, rowNumbers) {
      requireAdmin(actor);
      const db = await loadDatabase();
      return db.transaction(async (tx) => {
        const run = runSchema.parse(first(await tx.execute(sql`SELECT ${memberImportRuns.id} AS id, ${memberImportRuns.state} AS state, ${memberImportRuns.summary} AS summary, ${memberImportRuns.expiresAt} AS "expiresAt" FROM ${memberImportRuns} WHERE ${memberImportRuns.id} = ${runId}::uuid AND ${memberImportRuns.actorProfileId} = ${actor.profileId} FOR UPDATE`)));
        if (run.state !== "validated" || run.expiresAt.getTime() <= now().getTime()) throw new Error("IMPORT_CONFIRM_UNAVAILABLE");
        const confirmed = rows(await tx.execute(sql`UPDATE ${memberImportRows} SET confirmed = true WHERE ${memberImportRows.runId} = ${runId}::uuid AND ${inArray(memberImportRows.rowNumber, [...rowNumbers])} AND ${memberImportRows.validationStatus} IN ('create','update') RETURNING ${memberImportRows.id} AS id`));
        if (confirmed.length !== rowNumbers.length) throw new Error("IMPORT_CONFIRM_CONFLICT");
        await tx.execute(sql`UPDATE ${memberImportRuns} SET state = 'confirmed', confirmed_at = ${now()} WHERE ${memberImportRuns.id} = ${runId}::uuid`);
        await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${actor.profileId}, ${actor.kind}, 'member.import.confirmed', 'member_import_run', ${runId}, jsonb_build_object('rows', ${confirmed.length}::int))`);
        return summary(run.id, "confirmed", run.summary);
      });
    },
    async read(actor, runId) {
      requireAdmin(actor);
      const db = await loadDatabase();
      const run = runSchema.parse(first(await db.execute(sql`SELECT ${memberImportRuns.id} AS id, ${memberImportRuns.state} AS state, ${memberImportRuns.summary} AS summary, ${memberImportRuns.expiresAt} AS "expiresAt" FROM ${memberImportRuns} WHERE ${memberImportRuns.id} = ${runId}::uuid AND ${memberImportRuns.actorProfileId} = ${actor.profileId}`)));
      const detail = z.array(z.object({rowNumber: z.coerce.number().int(), status: z.enum(["create", "update", "unchanged", "duplicate", "conflict", "invalid"]), values: z.record(z.unknown()), before: z.record(z.unknown()), targetId: z.string().nullable(), expectedVersion: z.string().nullable(), reason: z.string().nullable()})).parse(rows(await db.execute(sql`SELECT ${memberImportRows.rowNumber} AS "rowNumber", ${memberImportRows.validationStatus} AS status, ${memberImportRows.validatedPayload} AS values, ${memberImportRows.beforeSnapshot} AS before, ${memberImportRows.matchTargetId} AS "targetId", ${memberImportRows.expectedVersion} AS "expectedVersion", ${memberImportRows.conflictReason} AS reason FROM ${memberImportRows} WHERE ${memberImportRows.runId} = ${runId}::uuid ORDER BY ${memberImportRows.rowNumber} LIMIT 5001`)));
      if (detail.length > 5000) throw new Error("IMPORT_TOO_MANY_ROWS");
      return {summary: summary(run.id, run.state, run.summary), rows: detail};
    },
  };
}
export const memberImportRepository = createMemberImportRepository();
