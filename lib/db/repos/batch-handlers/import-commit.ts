import "server-only";

import {inArray, sql} from "drizzle-orm";
import {z} from "zod";

import {batchPreviewDigest} from "@/lib/admin/batches/types";
import type {BatchOperationHandler} from "@/lib/admin/batches/worker-types";
import {randomUUID} from "node:crypto";

import {decideMembershipImport, isLegacyMemberKey, membershipDecisionRequiresWrite, readMembershipDecision, sameMembershipDecision, type MembershipImportDecision, type OpsImportPlanCode} from "@/lib/admin/imports/membership-decision";
import {membershipImportWriteMode} from "@/lib/admin/imports/membership-write-guard";
import {requireAdmin} from "@/lib/auth/authorize";
import {commitImportedCreate, commitImportedUpdate, loadImportPlanSeat} from "@/lib/db/repos/batch-handlers/import-membership-write";
import {contacts, memberImportRows, memberImportRuns, profiles} from "@/lib/db/server-schema";
import type {BatchExecutor} from "@/lib/db/repos/admin-batches";

function rows(result: unknown): unknown[] {if (Array.isArray(result)) return result; if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows; return [];}
const importRowSchema = z.object({id: z.string().uuid(), rowNumber: z.coerce.number().int(), status: z.enum(["create", "update"]), values: z.record(z.string(), z.unknown()), targetId: z.string().nullable(), expectedVersion: z.string().nullable()});
/** Pins the row decision, mapping-derived payload and original profile CAS version. */
function importRowPreviewVersion(row: z.infer<typeof importRowSchema>): string {
  return batchPreviewDigest({rowNumber: row.rowNumber, status: row.status, values: row.values, targetId: row.targetId, profileVersion: row.expectedVersion});
}
const currentProfileSchema = z.object({id: z.string(), role: z.string(), email: z.string().nullable(), locale: z.string(), updatedAt: z.string()});
function text(value: unknown): string | null {return typeof value === "string" && value.length ? value : null;}
function tags(value: unknown): string[] | null {return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;}
type MembershipBlock = "MEMBERSHIP_DECISION_INVALID" | "MEMBERSHIP_WRITE_PRODUCTION_FORBIDDEN" | "MEMBERSHIP_WRITE_DISABLED";

function membershipBlock(values: Readonly<Record<string, unknown>>): {decision: MembershipImportDecision | null; reason: MembershipBlock | null} {
  const decision = readMembershipDecision(values);
  if (values.membershipDecision != null && !decision) return {decision: null, reason: "MEMBERSHIP_DECISION_INVALID"};
  if (decision && !sameMembershipDecision(decision, decideMembershipImport(values))) return {decision, reason: "MEMBERSHIP_DECISION_INVALID"};
  if (!membershipDecisionRequiresWrite(decision)) return {decision, reason: null};
  const mode = membershipImportWriteMode();
  if (mode === "production_forbidden") return {decision, reason: "MEMBERSHIP_WRITE_PRODUCTION_FORBIDDEN"};
  if (mode !== "on") return {decision, reason: "MEMBERSHIP_WRITE_DISABLED"};
  return {decision, reason: null};
}

// Neon serverless Pool sends every statement as its own websocket round trip.
// The plan allowance does not change during a batch, so later items skip the
// savepoint. individual/platinum are inserted again inside the write statement,
// which repairs a bootstrap that rolled back after this cache was filled.
const importPlanSeats = new Map<OpsImportPlanCode, number>();
export function resetImportPlanSeatCache(): void {importPlanSeats.clear();}

async function seatForImportPlan(tx: BatchExecutor, planCode: MembershipImportDecision["planCode"]): Promise<number | null> {
  if (!planCode) return null;
  const cached = importPlanSeats.get(planCode);
  if (cached !== undefined) return cached;
  // 0069 only adds enum values. A database without it rejects individual/platinum; roll that statement back and fail the item instead of retrying a contact write.
  await tx.execute(sql`SAVEPOINT import_membership_plan`);
  try {
    const seat = await loadImportPlanSeat(tx, planCode);
    await tx.execute(sql`RELEASE SAVEPOINT import_membership_plan`);
    if (seat !== null) importPlanSeats.set(planCode, seat);
    return seat;
  } catch {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT import_membership_plan`);
    await tx.execute(sql`RELEASE SAVEPOINT import_membership_plan`);
    return null;
  }
}

function refuseMembershipWrite(reason: MembershipBlock): {status: "failed"; errorCode: string} | {status: "skipped"; reasonCode: string} {
  // Production is a hard failure. A flag that was turned off after preview must not quietly create a contact instead.
  if (reason === "MEMBERSHIP_WRITE_PRODUCTION_FORBIDDEN") return {status: "failed", errorCode: reason};
  return {status: "skipped", reasonCode: reason};
}

export const importCommitBatchHandler: BatchOperationHandler = {
  async prepare(actor, request, tx) {
    requireAdmin(actor);
    if (request.operation !== "import_commit") throw new Error("BATCH_OPERATION_MISMATCH");
    const run = rows(await tx.execute(sql`SELECT ${memberImportRuns.id} AS id FROM ${memberImportRuns} WHERE ${memberImportRuns.id} = ${request.payload.importRunId}::uuid AND ${memberImportRuns.actorProfileId} = ${actor.profileId} AND ${memberImportRuns.state} = 'confirmed' AND ${memberImportRuns.expiresAt} > now()`));
    if (!run.length) throw new Error("IMPORT_RUN_UNAVAILABLE");
    const selected = z.array(importRowSchema).parse(rows(await tx.execute(sql`SELECT ${memberImportRows.id} AS id, ${memberImportRows.rowNumber} AS "rowNumber", ${memberImportRows.validationStatus} AS status, ${memberImportRows.validatedPayload} AS values, ${memberImportRows.matchTargetId} AS "targetId", ${memberImportRows.expectedVersion} AS "expectedVersion" FROM ${memberImportRows} WHERE ${memberImportRows.runId} = ${request.payload.importRunId}::uuid AND ${memberImportRows.confirmed} = true AND ${memberImportRows.validationStatus} IN ('create','update') ORDER BY ${memberImportRows.rowNumber} LIMIT 5001`)));
    if (!selected.length || selected.length > 5000) throw new Error("IMPORT_SELECTION_INVALID");
    const profileIds = [...new Set(selected.map((row) => row.targetId).filter((value): value is string => value !== null))];
    const emails = [...new Set(selected.map((row) => text(row.values.email)).filter((value): value is string => value !== null))];
    const existing = profileIds.length ? z.array(currentProfileSchema).parse(rows(await tx.execute(sql`SELECT ${profiles.id} AS id, ${profiles.role} AS role, ${profiles.email} AS email, ${profiles.locale} AS locale, ${profiles.updatedAt}::text AS "updatedAt" FROM ${profiles} WHERE ${inArray(profiles.id, profileIds)}`))) : [];
    const emailProfiles = emails.length ? z.array(z.object({email: z.string()})).parse(rows(await tx.execute(sql`SELECT lower(${profiles.email}) AS email FROM ${profiles} WHERE ${inArray(sql`lower(${profiles.email})`, emails)}`))) : [];
    const emailContacts = emails.length ? z.array(z.object({email: z.string()})).parse(rows(await tx.execute(sql`SELECT lower(${contacts.email}) AS email FROM ${contacts} WHERE ${inArray(sql`lower(${contacts.email})`, emails)}`))) : [];
    const profileMap = new Map(existing.map((row) => [row.id, row]));
    const occupied = new Set([...emailProfiles, ...emailContacts].map((row) => row.email));
    return selected.map((row) => {
      const current = row.targetId ? profileMap.get(row.targetId) : null;
      const email = text(row.values.email)?.toLocaleLowerCase("en") ?? null;
      const identityReason = row.status === "update"
        ? !current || current.role !== "member" || current.updatedAt !== row.expectedVersion ? "PROFILE_VERSION_CONFLICT"
          : email && current.email?.toLocaleLowerCase("en") !== email ? "EMAIL_IDENTITY_CONFLICT" : null
        : !email || occupied.has(email) ? "EMAIL_CANDIDATE_REVIEW" : null;
      const gate = membershipBlock(row.values);
      const reasonCode = identityReason ?? gate.reason;
      const previewStatus = reasonCode ? "blocked" as const : "eligible" as const;
      const write = membershipDecisionRequiresWrite(gate.decision);
      return {target: {type: "import_row" as const, id: row.id}, previewStatus, eligible: !reasonCode, reasonCode, expectedVersion: importRowPreviewVersion(row), before: current ? {profileId: current.id, locale: current.locale} : {}, after: {kind: write ? "imported membership" : row.status === "create" ? "CRM contact, not active member" : "member correction", locale: text(row.values.locale), tags: tags(row.values.tags), planRecommendation: gate.decision?.planCode ?? text(row.values.planCode), ...(write && gate.decision ? {planCode: gate.decision.planCode, membershipStatus: gate.decision.membershipStatus, billingPeriodEnd: gate.decision.billingPeriodEnd} : {})}};
    });
  },
  async execute(actor, claim, tx) {
    requireAdmin(actor);
    if (claim.operation !== "import_commit" || claim.request.operation !== "import_commit" || claim.target.type !== "import_row") return {status: "failed", errorCode: "BATCH_OPERATION_MISMATCH"};
    const parsed = rows(await tx.execute(sql`SELECT r.id AS id, r.row_number AS "rowNumber", r.validation_status AS status, r.validated_payload AS values, r.match_target_id AS "targetId", r.expected_version AS "expectedVersion" FROM ${memberImportRows} r JOIN ${memberImportRuns} run ON run.id = r.run_id WHERE r.id = ${claim.target.id}::uuid AND r.run_id = ${claim.request.payload.importRunId}::uuid AND r.confirmed = true AND r.validation_status IN ('create','update') AND run.actor_profile_id = ${actor.profileId} AND run.state = 'confirmed' AND run.expires_at > now() FOR UPDATE OF r`));
    if (!parsed.length) return {status: "skipped", reasonCode: "IMPORT_ROW_UNAVAILABLE"};
    const row = importRowSchema.parse(parsed[0]);
    if (importRowPreviewVersion(row) !== claim.expectedVersion) return {status: "skipped", reasonCode: "IMPORT_ROW_CHANGED"};
    const gate = membershipBlock(row.values);
    if (gate.reason) return refuseMembershipWrite(gate.reason);
    if (gate.decision?.outcome === "skipped") return {status: "skipped", reasonCode: gate.decision.reason ?? "IMPORT_ROW_SKIPPED"};
    const ownerId = text(row.values.ownerProfileId);
    const email = text(row.values.email)?.toLocaleLowerCase("en") ?? null;
    const runId = claim.request.payload.importRunId;
    const write = membershipDecisionRequiresWrite(gate.decision) && gate.decision?.planCode && gate.decision.membershipStatus ? gate.decision : null;
    let seat: number | null = null;
    if (write?.planCode) {
      seat = await seatForImportPlan(tx, write.planCode);
      if (seat === null) return {status: "failed", errorCode: "MEMBERSHIP_PLAN_NOT_FOUND"};
    }
    if (row.status === "create") {
      if (!email) return {status: "skipped", reasonCode: "EMAIL_MISSING"};
      const profileId = write ? randomUUID() : null;
      const legacy = text(row.values.legacyMemberId);
      // A return here would commit the shell. This id is a new uuid; a legacy IN* key must never be it.
      if (profileId && (isLegacyMemberKey(profileId) || profileId === legacy)) throw new Error("LEGACY_MEMBER_ID_NOT_PROFILE");
      const displayName = text(row.values.displayName);
      const created = await commitImportedCreate(tx, {actor, runId, rowNumber: row.rowNumber, email, displayName, profileName: (displayName?.trim() || email).slice(0, 200), profileLocale: text(row.values.locale) === "zh-HK" ? "zh-HK" : "en", contactLocale: text(row.values.locale) ?? "en", stage: gate.decision?.outcome === "would_create_membership" ? "member" : gate.decision?.outcome === "would_set_expired" ? "closed" : "new", ownerId, tags: tags(row.values.tags) ?? [], profileId, decision: gate.decision, planCode: write?.planCode ?? null, membershipStatus: write?.membershipStatus ?? null, seat, billingPeriodStart: write?.billingPeriodStart ?? null, billingPeriodEnd: write?.billingPeriodEnd ?? null});
      if (created.outcome === "occupied") return {status: "skipped", reasonCode: "EMAIL_CANDIDATE_REVIEW"};
      if (created.outcome === "owner_invalid") return {status: "skipped", reasonCode: "OWNER_NOT_STAFF"};
      if (write && !created.membershipId) throw new Error("IMPORT_WRITE_INCOMPLETE");
      return {status: "succeeded", resultRef: created.contactId};
    }
    const targetId = row.targetId;
    if (!targetId || !row.expectedVersion) return {status: "skipped", reasonCode: "PROFILE_ID_NOT_MEMBER"};
    if (isLegacyMemberKey(targetId)) return {status: "skipped", reasonCode: "LEGACY_MEMBER_ID_NOT_PROFILE"};
    const updated = await commitImportedUpdate(tx, {actor, runId, rowNumber: row.rowNumber, profileId: targetId, email, expectedVersion: row.expectedVersion, locale: text(row.values.locale), ownerId, hasTags: tags(row.values.tags) !== null, tags: tags(row.values.tags) ?? [], touchMetadata: row.values.tags !== undefined || Boolean(ownerId), decision: gate.decision, planCode: write?.planCode ?? null, membershipStatus: write?.membershipStatus ?? null, seat, billingPeriodStart: write?.billingPeriodStart ?? null, billingPeriodEnd: write?.billingPeriodEnd ?? null});
    if (updated.outcome === "owner_invalid") return {status: "skipped", reasonCode: "OWNER_NOT_STAFF"};
    if (updated.outcome === "conflict") return {status: "skipped", reasonCode: "PROFILE_VERSION_CONFLICT"};
    if (write && !updated.membershipId) throw new Error("IMPORT_WRITE_INCOMPLETE");
    return {status: "succeeded", resultRef: targetId};
  },
};
