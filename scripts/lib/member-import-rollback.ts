import {z} from "zod";

import {membershipImportWriteMode} from "@/lib/admin/imports/membership-write-guard";

const uuid = z.string().uuid();

export type MemberImportRollbackScope = Readonly<{runId: string; batchId: string; apply: boolean}>;

/**
 * Same production split as membership import writes: VERCEL_ENV=production is
 * refused, and so is a production Node process that is not an explicit Vercel
 * preview or development deployment. Dry-run is the default even when writes
 * are allowed. This does not inspect the database host — point DATABASE_URL
 * at the staging branch yourself.
 */
export function assertMemberImportRollbackAuthorized(environment: Readonly<Record<string, string | undefined>>): MemberImportRollbackScope {
  const mode = membershipImportWriteMode(environment);
  if (mode === "production_forbidden") throw new Error("MEMBER_IMPORT_ROLLBACK_PRODUCTION_FORBIDDEN");
  if (mode !== "on") throw new Error("MEMBER_IMPORT_ROLLBACK_NOT_AUTHORIZED");
  const runId = uuid.safeParse(environment.MEMBER_IMPORT_ROLLBACK_RUN_ID?.trim());
  const batchId = uuid.safeParse(environment.MEMBER_IMPORT_ROLLBACK_BATCH_ID?.trim());
  if (!runId.success || !batchId.success) throw new Error("MEMBER_IMPORT_ROLLBACK_SCOPE_REQUIRED");
  if (runId.data === batchId.data) throw new Error("MEMBER_IMPORT_ROLLBACK_SCOPE_REQUIRED");
  return {runId: runId.data, batchId: batchId.data, apply: environment.MEMBER_IMPORT_ROLLBACK_APPLY === "true"};
}

/** Catalog rows and batch history stay. The script never deletes these. */
export const MEMBER_IMPORT_ROLLBACK_PRESERVED = ["membership_plans", "admin_batches", "admin_batch_items", "member_import_rows", "member_import_runs", "member_import_uploads"] as const;

export const MEMBER_IMPORT_ROLLBACK_STEPS = [
  "verify-scope",
  "refuse-profile-updates",
  "refuse-dependents",
  "delete-inserted-memberships",
  "delete-import-contacts",
  "delete-hidden-profile-shells",
  "delete-import-audits",
  "record-rollback-audit",
  "restore-run-confirmed",
] as const;

const scopeSql = `SELECT b.id AS batch_id, b.state AS batch_state, r.id AS run_id, r.state AS run_state, r.actor_profile_id, p.role AS actor_role
FROM admin_batches b
JOIN member_import_runs r ON r.id = $1::uuid
JOIN profiles p ON p.id = r.actor_profile_id
WHERE b.id = $2::uuid
  AND b.operation = 'import_commit'
  AND b.actor_profile_id = r.actor_profile_id
  AND b.selection_snapshot->'payload'->>'importRunId' = r.id::text`;

/** Audits for succeeded items of this batch only. $1 run id, $2 batch id. */
export const memberImportRollbackAuditSql = `SELECT a.id, a.target_type, a.target_id, a.metadata
FROM audit_events a
WHERE a.action = 'member.import.row.committed'
  AND a.metadata->>'runId' = $1::text
  AND EXISTS (
    SELECT 1 FROM admin_batch_items i
    WHERE i.batch_id = $2::uuid AND i.state = 'succeeded' AND i.result_ref = a.target_id
  )`;

export const memberImportRollbackScopeSql = scopeSql;

export type Queryable = Readonly<{query: (text: string, values?: readonly unknown[]) => Promise<{rows: readonly Record<string, unknown>[]}>}>;

export type MemberImportRollbackReport = Readonly<{
  apply: boolean;
  runId: string;
  batchId: string;
  runState: string;
  batchState: string;
  contacts: number;
  profileShells: number;
  insertedMemberships: number;
  profileUpdates: number;
  updatedMemberships: number;
  dependents: number;
  irreversibleMemberships: number;
  preserved: readonly string[];
}>;

const scopeRow = z.object({batch_id: z.string().uuid(), batch_state: z.string(), run_id: z.string().uuid(), run_state: z.string(), actor_profile_id: z.string(), actor_role: z.string()});

async function loadScope(db: Queryable, scope: MemberImportRollbackScope, lock: boolean) {
  const result = await db.query(`${scopeSql}${lock ? " FOR UPDATE OF b, r" : ""}`, [scope.runId, scope.batchId]);
  const row = result.rows[0];
  if (!row || result.rows.length !== 1) throw new Error("MEMBER_IMPORT_ROLLBACK_SCOPE_MISMATCH");
  return scopeRow.parse(row);
}

const reportRow = z.object({
  contacts: z.coerce.number().int().nonnegative(),
  profile_shells: z.coerce.number().int().nonnegative(),
  inserted_memberships: z.coerce.number().int().nonnegative(),
  profile_updates: z.coerce.number().int().nonnegative(),
  updated_memberships: z.coerce.number().int().nonnegative(),
  dependents: z.coerce.number().int().nonnegative(),
  irreversible_memberships: z.coerce.number().int().nonnegative(),
});

const tallySql = `WITH audits AS (
  ${memberImportRollbackAuditSql}
), contacts_in_scope AS (
  SELECT c.id, c.profile_id
  FROM contacts c
  JOIN audits a ON a.target_type = 'contact' AND a.target_id = c.id::text
  WHERE c.source = 'import'
), shells AS (
  SELECT p.id FROM profiles p
  JOIN contacts_in_scope c ON c.profile_id = p.id
  WHERE p.auth_user_id = p.id AND p.directory_visible = false AND p.role = 'member'
), inserted AS (
  SELECT m.id FROM memberships m
  JOIN audits a ON a.metadata->>'membershipId' = m.id::text AND a.metadata->>'membershipAction' = 'inserted'
  WHERE m.stripe_customer_id IS NULL AND m.stripe_subscription_id IS NULL AND m.application_id IS NULL AND m.company_id IS NULL AND m.grant_effective_at IS NULL
)
SELECT
  (SELECT count(*)::int FROM contacts_in_scope) AS contacts,
  (SELECT count(*)::int FROM shells) AS profile_shells,
  (SELECT count(*)::int FROM inserted) AS inserted_memberships,
  (SELECT count(*)::int FROM audits WHERE target_type = 'profile') AS profile_updates,
  (SELECT count(*)::int FROM audits WHERE metadata->>'membershipAction' = 'updated') AS updated_memberships,
  (SELECT count(*)::int FROM audits a WHERE a.metadata->>'membershipAction' = 'inserted')
    - (SELECT count(*)::int FROM inserted) AS irreversible_memberships,
  (
    (SELECT count(*)::int FROM contact_activities x WHERE x.contact_id IN (SELECT id FROM contacts_in_scope))
    + (SELECT count(*)::int FROM join_invites x WHERE x.contact_id IN (SELECT id FROM contacts_in_scope))
    + (SELECT count(*)::int FROM billing_attempts x WHERE x.membership_id IN (SELECT id FROM inserted))
    + (SELECT count(*)::int FROM company_members x WHERE x.user_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM conversations x WHERE x.profile_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM member_notes x WHERE x.profile_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM journey_state x WHERE x.profile_id IN (SELECT id FROM shells) OR x.membership_id IN (SELECT id FROM inserted))
    + (SELECT count(*)::int FROM engagement_events x WHERE x.profile_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM engagement_scores x WHERE x.profile_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM membership_applications x WHERE x.applicant_user_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM event_registrations x WHERE x.profile_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM event_orders x WHERE x.buyer_profile_id IN (SELECT id FROM shells))
    + (SELECT count(*)::int FROM memberships m WHERE m.owner_user_id IN (SELECT id FROM shells) AND m.id NOT IN (SELECT id FROM inserted))
  ) AS dependents`;

export async function inspectMemberImportRollback(db: Queryable, scope: MemberImportRollbackScope): Promise<MemberImportRollbackReport> {
  const owned = await loadScope(db, scope, false);
  const tally = reportRow.parse((await db.query(tallySql, [scope.runId, scope.batchId])).rows[0]);
  return {apply: scope.apply, runId: owned.run_id, batchId: owned.batch_id, runState: owned.run_state, batchState: owned.batch_state, contacts: tally.contacts, profileShells: tally.profile_shells, insertedMemberships: tally.inserted_memberships, profileUpdates: tally.profile_updates, updatedMemberships: tally.updated_memberships, dependents: tally.dependents, irreversibleMemberships: tally.irreversible_memberships, preserved: MEMBER_IMPORT_ROLLBACK_PRESERVED};
}

function assertReversible(report: Pick<MemberImportRollbackReport, "profileUpdates" | "updatedMemberships" | "dependents" | "irreversibleMemberships">): void {
  if (report.profileUpdates > 0 || report.updatedMemberships > 0) throw new Error("MEMBER_IMPORT_ROLLBACK_UPDATE_UNSUPPORTED");
  if (report.dependents > 0) throw new Error("MEMBER_IMPORT_ROLLBACK_DEPENDENTS");
  if (report.irreversibleMemberships > 0) throw new Error("MEMBER_IMPORT_ROLLBACK_MEMBERSHIP_NOT_REVERSIBLE");
}

const shellSql = `SELECT p.id
FROM profiles p
JOIN contacts c ON c.profile_id = p.id AND c.source = 'import'
JOIN audit_events a ON a.action = 'member.import.row.committed' AND a.target_type = 'contact' AND a.target_id = c.id::text AND a.metadata->>'runId' = $1::text
WHERE p.auth_user_id = p.id AND p.directory_visible = false AND p.role = 'member'
  AND EXISTS (SELECT 1 FROM admin_batch_items i WHERE i.batch_id = $2::uuid AND i.state = 'succeeded' AND i.result_ref = a.target_id)
FOR UPDATE OF p`;

/**
 * Deletes only rows this batch's succeeded create audits point at.
 * Profile updates are refused: the audit does not keep the previous membership.
 * membership_plans are shared catalog rows and are not deleted.
 * Pass one checked-out client. pool.query may switch connections between statements.
 */
export async function applyMemberImportRollback(db: Queryable, scope: MemberImportRollbackScope): Promise<MemberImportRollbackReport> {
  if (!scope.apply) throw new Error("MEMBER_IMPORT_ROLLBACK_DRY_RUN");
  await db.query("BEGIN");
  try {
    const owned = await loadScope(db, scope, true);
    const report = await inspectMemberImportRollback(db, {...scope, apply: true});
    assertReversible(report);
    const shellIds = z.array(z.string().min(1)).parse((await db.query(shellSql, [scope.runId, scope.batchId])).rows.map((row) => row.id));
    const deletedMemberships = (await db.query(`DELETE FROM memberships m WHERE m.id IN (
      SELECT m.id FROM memberships m
      JOIN audit_events a ON a.metadata->>'membershipId' = m.id::text AND a.metadata->>'membershipAction' = 'inserted'
      WHERE a.action = 'member.import.row.committed' AND a.metadata->>'runId' = $1::text
        AND m.stripe_customer_id IS NULL AND m.stripe_subscription_id IS NULL AND m.application_id IS NULL AND m.company_id IS NULL AND m.grant_effective_at IS NULL
        AND EXISTS (SELECT 1 FROM admin_batch_items i WHERE i.batch_id = $2::uuid AND i.state = 'succeeded' AND i.result_ref = a.target_id)
    ) RETURNING m.id`, [scope.runId, scope.batchId])).rows.length;
    const deletedContacts = (await db.query(`DELETE FROM contacts c WHERE c.source = 'import' AND c.id IN (
      SELECT a.target_id::uuid FROM audit_events a
      WHERE a.action = 'member.import.row.committed' AND a.target_type = 'contact' AND a.metadata->>'runId' = $1::text
        AND EXISTS (SELECT 1 FROM admin_batch_items i WHERE i.batch_id = $2::uuid AND i.state = 'succeeded' AND i.result_ref = a.target_id)
    ) RETURNING c.id`, [scope.runId, scope.batchId])).rows.length;
    const deletedProfiles = shellIds.length === 0 ? 0 : (await db.query(`DELETE FROM profiles p WHERE p.id = ANY($1::text[]) AND p.auth_user_id = p.id AND p.directory_visible = false AND p.role = 'member' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.profile_id = p.id) AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.owner_user_id = p.id) RETURNING p.id`, [shellIds])).rows.length;
    const deletedAudits = (await db.query(`DELETE FROM audit_events a WHERE a.metadata->>'runId' = $1::text AND (
      (a.action = 'member.import.row.committed' AND EXISTS (SELECT 1 FROM admin_batch_items i WHERE i.batch_id = $2::uuid AND i.state = 'succeeded' AND i.result_ref = a.target_id))
      OR (a.action = 'member.import.committed' AND a.target_type = 'member_import_run' AND a.target_id = $1::text AND a.metadata->>'batchId' = $2::text)
    ) RETURNING a.id`, [scope.runId, scope.batchId])).rows.length;
    const restored = owned.run_state === "committed" ? (await db.query(`UPDATE member_import_runs SET state = 'confirmed' WHERE id = $1::uuid AND state = 'committed' RETURNING id`, [scope.runId])).rows.length : 0;
    if (deletedMemberships + deletedContacts + deletedProfiles + deletedAudits + restored > 0) {
      await db.query(`INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata)
        VALUES ($3, $4, 'member.import.rolled_back', 'member_import_run', $1, jsonb_build_object('batchId', $2::text, 'contacts', $5::int, 'profiles', $6::int, 'memberships', $7::int))`, [scope.runId, scope.batchId, owned.actor_profile_id, owned.actor_role, deletedContacts, deletedProfiles, deletedMemberships]);
    }
    await db.query("COMMIT");
    return {...report, apply: true, runState: restored > 0 ? "confirmed" : report.runState, contacts: deletedContacts, profileShells: deletedProfiles, insertedMemberships: deletedMemberships};
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
