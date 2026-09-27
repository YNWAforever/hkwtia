import {Pool} from "pg";

import {M2_MEMBERSHIP_ROWS, M2_PROFILE_ROWS, M2_REFERENCE_INSTANT, M2_UUIDS, seedM2} from "@/scripts/seed-m2";

type ResetConnection = Readonly<{
  query: (sql: string, values?: readonly unknown[]) => Promise<unknown>;
  release: () => void;
}>;

type ResetDependencies = Readonly<{
  connect: () => Promise<ResetConnection>;
  seed: () => Promise<void>;
}>;

type ResetEnvironment = NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;

function requireAllowlistedNeonProject(environment: ResetEnvironment, databaseUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname.toLowerCase();
    if (!hostname.endsWith(".neon.tech")) return;
  } catch {
    return;
  }

  const configuredProjectId = environment.NEON_PROJECT_ID?.trim();
  const allowlistedProjectId = environment.M2_TEST_NEON_PROJECT_ID?.trim();
  if (!configuredProjectId || !allowlistedProjectId || configuredProjectId !== allowlistedProjectId) {
    throw new Error("M2_RESET_REQUIRES_ISOLATED_NEON_PROJECT");
  }

  const allowlistedHost = environment.M2_TEST_NEON_HOST?.trim().toLowerCase();
  if (!allowlistedHost?.endsWith(".neon.tech") || hostname !== allowlistedHost) {
    throw new Error("M2_RESET_REQUIRES_ISOLATED_NEON_ENDPOINT");
  }
}

function isolatedDatabaseUrl(environment: ResetEnvironment): string | null {
  const testUrl = environment.DATABASE_URL_TEST;
  if (!testUrl?.trim()) return null;
  if (environment.DATABASE_URL !== testUrl) throw new Error("M2_RESET_REQUIRES_ISOLATED_DATABASE");
  requireAllowlistedNeonProject(environment, testUrl);
  return testUrl;
}

async function resetKnownBrowserMutations(connection: ResetConnection): Promise<void> {
  const campaignDraftId = "30000000-0000-4000-8000-000000000001";
  const eventRegistrationKey = `${M2_UUIDS.events[0]}:m2-member-04`;
  const approvalId = M2_UUIDS.approvals[1];

  await connection.query(`DELETE FROM audit_events
    WHERE action='member_note.appended' AND target_type='profile' AND target_id='m2-risk-01'
      AND metadata->>'noteId' IN (
        SELECT id::text FROM member_notes WHERE profile_id='m2-risk-01' AND author_profile_id='m2-staff-01' AND body='M2 acceptance follow-up'
      )`);
  await connection.query("DELETE FROM member_notes WHERE profile_id='m2-risk-01' AND author_profile_id='m2-staff-01' AND body='M2 acceptance follow-up'");
  await connection.query("DELETE FROM audit_events WHERE action='campaign.queued' AND target_id IN (SELECT id::text FROM campaigns WHERE idempotency_key=$1)", [campaignDraftId]);
  await connection.query("DELETE FROM campaigns WHERE idempotency_key=$1", [campaignDraftId]);
  await connection.query("DELETE FROM audit_events WHERE action='segment.exported' AND target_type='saved_segment' AND target_id=$1", [M2_UUIDS.segments[0]]);
  await connection.query("DELETE FROM audit_events WHERE action='event.attendee.checked_in' AND target_type='event_registration' AND target_id=$1", [eventRegistrationKey]);
  await connection.query("DELETE FROM engagement_events WHERE type='event_attended' AND metadata->>'registrationKey'=$1", [eventRegistrationKey]);
  await connection.query("UPDATE event_registrations SET status='registered', checked_in_at=NULL WHERE event_id=$1 AND profile_id='m2-member-04'", [M2_UUIDS.events[0]]);
  await connection.query("DELETE FROM audit_events WHERE action IN ('approval.approved','approval.rejected') AND target_type='approval' AND target_id=$1", [approvalId]);
}

export async function resetM2AuthenticatedFixtures(environment: ResetEnvironment = process.env, injected?: ResetDependencies, operationalReference?: Date): Promise<"skipped" | "reset"> {
  const databaseUrl = isolatedDatabaseUrl(environment);
  if (!databaseUrl) return "skipped";

  const pool = injected ? null : new Pool({connectionString: databaseUrl});
  try {
    const dependencies: ResetDependencies = injected ?? {
      connect: async () => pool!.connect(),
      seed: async () => seedM2(pool!),
    };
    const connection = await dependencies.connect();
    let transactionOpen = false;
    try {
      await connection.query("BEGIN");
      transactionOpen = true;
      await resetKnownBrowserMutations(connection);
      await connection.query("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) {
        try { await connection.query("ROLLBACK"); } catch { /* Preserve the reset failure. */ }
      }
      throw error;
    } finally {
      connection.release();
    }

    await dependencies.seed();
    if (operationalReference) {
      // The immutable July seed is also used by historical report assertions.
      // Only a caller explicitly exercising today's operational queues opts in.
      // Derive from the seed every time, never add an offset to already shifted rows.
      const offset = operationalReference.getTime() - M2_REFERENCE_INSTANT.getTime();
      if (!Number.isFinite(offset)) throw new Error("M2_OPERATIONAL_REFERENCE_INVALID");
      const shifted = (value: string | null) => value === null ? null : new Date(new Date(value).getTime() + offset).toISOString();
      const profiles = M2_PROFILE_ROWS.map(row => ({id: row.id, last_login_at: shifted(row.lastLoginAt)}));
      const memberships = M2_MEMBERSHIP_ROWS.map(row => ({id: row.id, billing_period_start: shifted(row.billingPeriodStart), billing_period_end: shifted(row.billingPeriodEnd)}));
      const dated = await dependencies.connect();
      try {
        await dated.query("BEGIN");
        await dated.query(`UPDATE profiles AS target SET last_login_at=fixture.last_login_at
          FROM jsonb_to_recordset($1::jsonb) AS fixture(id text, last_login_at timestamptz)
          WHERE target.id=fixture.id`, [JSON.stringify(profiles)]);
        await dated.query(`UPDATE memberships AS target SET billing_period_start=fixture.billing_period_start, billing_period_end=fixture.billing_period_end
          FROM jsonb_to_recordset($1::jsonb) AS fixture(id uuid, billing_period_start timestamptz, billing_period_end timestamptz)
          WHERE target.id=fixture.id`, [JSON.stringify(memberships)]);
        await dated.query("COMMIT");
      } catch (error) {
        try { await dated.query("ROLLBACK"); } catch { /* Preserve the fixture failure. */ }
        throw error;
      } finally { dated.release(); }
    }
    return "reset";
  } finally {
    await pool?.end();
  }
}

export async function readM2ApprovalFact(environment: ResetEnvironment, approvalId: string): Promise<Readonly<{status: string; decidedByProfileId: string | null; auditCount: number}>> {
  const databaseUrl = isolatedDatabaseUrl(environment);
  if (!databaseUrl) throw new Error("DATABASE_URL_TEST is required for M2 acceptance facts");
  const pool = new Pool({connectionString: databaseUrl});
  try {
    const result = await pool.query<{status: string; decided_by_profile_id: string | null; audit_count: string}>(
      "SELECT status, decided_by_profile_id, " +
      "(SELECT count(*)::text FROM audit_events WHERE action='approval.approved' AND target_type='approval' AND target_id=$1::text) AS audit_count " +
      "FROM approvals WHERE id=$2::uuid",
      [approvalId, approvalId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("M2_APPROVAL_FACT_NOT_FOUND");
    return {status: row.status, decidedByProfileId: row.decided_by_profile_id, auditCount: Number(row.audit_count)};
  } finally {
    await pool.end();
  }
}