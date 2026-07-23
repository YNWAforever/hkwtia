import {execFile as execFileCallback, execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {promisify} from "node:util";

import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {getMember360} from "@/lib/admin/member-360";
import {searchAdminMembers} from "@/lib/admin/members";
import {getAdminReport} from "@/lib/admin/reports";
import {listPendingApprovals} from "@/lib/admin/approvals";
import {queueCampaign} from "@/lib/admin/campaigns";
import {parseSegmentRouteQuery} from "@/lib/admin/segment-schema";
import {previewSegment} from "@/lib/admin/segments";
import {listAtRiskMembers} from "@/lib/admin/at-risk";
import type {AdminActor} from "@/lib/membership/lifecycle";
import {M2_AT_RISK_PROFILE_IDS, M2_PROFILE_ROWS, M2_REFERENCE_INSTANT, M2_UUIDS} from "@/scripts/seed-m2";

const execFile = promisify(execFileCallback);
const externalDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const disposableEnabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const enabled = Boolean(externalDatabaseUrl) || disposableEnabled;
const container = `hkwtia-m2-acceptance-${process.pid}`;
const staff: AdminActor = {kind: "staff", userId: "m2-auth-staff-01", profileId: "m2-staff-01"};
const M2_TABLES = [
  "approvals",
  "campaign_recipients",
  "campaigns",
  "email_log",
  "engagement_events",
  "engagement_scores",
  "event_registrations",
  "events",
  "member_notes",
  "saved_segments",
] as const;
const COUNTED_TABLES = [
  "membership_plans",
  "profiles",
  "companies",
  "company_members",
  "membership_applications",
  "memberships",
  ...M2_TABLES,
] as const;
const EXPECTED_SEED_COUNTS: Readonly<Record<(typeof COUNTED_TABLES)[number], number>> = {
  membership_plans: 4,
  profiles: 30,
  companies: 12,
  company_members: 18,
  membership_applications: 18,
  memberships: 18,
  approvals: 2,
  campaign_recipients: 3,
  campaigns: 1,
  email_log: 6,
  engagement_events: 8,
  engagement_scores: 30,
  event_registrations: 9,
  events: 4,
  member_notes: 4,
  saved_segments: 2,
};

let databaseUrl = externalDatabaseUrl;
let pool: Pool | undefined;
let firstSeedCounts: Record<string, number> = {};

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error("isolated PostgreSQL 16 did not become ready");
}

async function runDatabaseCommand(command: "db:migrate" | "db:seed"): Promise<string> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const {stdout, stderr} = await execFile(npm, ["run", command], {
    cwd: process.cwd(),
    env: {...process.env, DATABASE_URL: databaseUrl},
    maxBuffer: 4 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  return `${stdout}\n${stderr}`;
}

async function tableCounts(): Promise<Record<string, number>> {
  if (!pool) throw new Error("acceptance pool is unavailable");
  const counts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    const result = await pool.query<{count: number}>(`SELECT count(*)::int AS count FROM ${table}`);
    counts[table] = result.rows[0]?.count ?? -1;
  }
  return counts;
}

describe.skipIf(!enabled)("M2 seed acceptance on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (!externalDatabaseUrl) {
      docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
      await waitForPostgres();
      const binding = docker(["port", container, "5432/tcp"]).trim();
      const port = binding.slice(binding.lastIndexOf(":") + 1);
      if (!/^\d+$/.test(port)) throw new Error("isolated PostgreSQL 16 port was unavailable");
      databaseUrl = `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`;
    }

    const outputs = [await runDatabaseCommand("db:migrate"), await runDatabaseCommand("db:migrate"), await runDatabaseCommand("db:seed")];
    for (const output of outputs) expect(output).not.toContain(databaseUrl);

    pool = new Pool({connectionString: databaseUrl});
    database.current = drizzle(pool);
    firstSeedCounts = await tableCounts();

    const secondSeedOutput = await runDatabaseCommand("db:seed");
    expect(secondSeedOutput).not.toContain(databaseUrl);
  }, 600_000);

  afterAll(async () => {
    vi.useRealTimers();
    if (pool) await pool.end();
    if (!externalDatabaseUrl) {
      try { docker(["rm", "-f", container]); } catch { /* Container may already be gone. */ }
    }
  });

  it("creates the ten required M2 tables and exact fixture counts idempotently", async () => {
    if (!pool) throw new Error("acceptance pool is unavailable");
    const tables = await pool.query<{table_name: string}>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)
       ORDER BY table_name`,
      [[...M2_TABLES]],
    );
    expect(tables.rows.map(({table_name}) => table_name)).toEqual([...M2_TABLES]);
    expect(firstSeedCounts).toEqual(EXPECTED_SEED_COUNTS);
    const mutableContracts = await pool.query<{queued_campaigns: number; pending_approvals: number}>(`
      SELECT
        (SELECT count(*)::int FROM campaigns WHERE status = 'queued') AS queued_campaigns,
        (SELECT count(*)::int FROM approvals WHERE status = 'pending') AS pending_approvals
    `);
    expect(mutableContracts.rows[0]).toEqual({queued_campaigns: 1, pending_approvals: 2});
    expect(await tableCounts()).toEqual(firstSeedCounts);
  });

  it("preserves mapped auth identities while restoring every other mutable seeded profile field", async () => {
    if (!pool) throw new Error("acceptance pool is unavailable");
    const profileIds = ["m2-staff-01", "m2-member-04", "m2-risk-01"] as const;
    const expectedProfiles = M2_PROFILE_ROWS.filter(({id}) => profileIds.includes(id as (typeof profileIds)[number]))
      .sort((left, right) => left.id.localeCompare(right.id));
    const fresh = await pool.query<{id: string; auth_user_id: string}>(
      "SELECT id, auth_user_id FROM profiles WHERE id = ANY($1::text[]) ORDER BY id",
      [[...profileIds]],
    );
    expect(fresh.rows).toEqual(expectedProfiles.map(({id, authUserId}) => ({id, auth_user_id: authUserId})));

    const mappedAuthIds = new Map<string, string>(profileIds.map((id, index) => [id, `preview-auth-user-${index + 1}`]));
    for (const id of profileIds) {
      await pool.query(
        `UPDATE profiles SET auth_user_id=$2,email=$3,role='superadmin',last_login_at='2030-01-01T00:00:00.000Z',
          consent_marketing=true,interests=ARRAY['dirty'],display_name='Dirty profile',phone='+852 0000 0000',
          job_title='Dirty role',locale='zh-HK',onboarding_state='profile',directory_visible=false,
          updated_at='2030-01-01T00:00:00.000Z' WHERE id=$1`,
        [id, mappedAuthIds.get(id), `${id}@dirty.invalid`],
      );
    }

    const reseedOutput = await runDatabaseCommand("db:seed");
    expect(reseedOutput).not.toContain(databaseUrl);
    const reseeded = await pool.query<{
      id: string;
      auth_user_id: string;
      email: string;
      role: string;
      last_login_at: Date | null;
      consent_marketing: boolean;
      interests: string[];
      display_name: string;
      phone: string | null;
      job_title: string | null;
      locale: string;
      onboarding_state: string;
      directory_visible: boolean;
      updated_at: Date;
    }>(`SELECT id,auth_user_id,email,role,last_login_at,consent_marketing,interests,display_name,phone,
      job_title,locale,onboarding_state,directory_visible,updated_at
      FROM profiles WHERE id = ANY($1::text[]) ORDER BY id`, [[...profileIds]]);

    expect(reseeded.rows).toEqual(expectedProfiles.map((profile) => ({
      id: profile.id,
      auth_user_id: mappedAuthIds.get(profile.id),
      email: profile.email,
      role: profile.role,
      last_login_at: profile.lastLoginAt ? new Date(profile.lastLoginAt) : null,
      consent_marketing: profile.consentMarketing,
      interests: [...profile.interests],
      display_name: profile.displayName,
      phone: null,
      job_title: "M2 Fixture Role",
      locale: profile.locale,
      onboarding_state: "complete",
      directory_visible: profile.role === "member",
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    })));
  });

  it("enforces note replacement SET NULL and indexes renewal windows in PostgreSQL", async () => {
    if (!pool) throw new Error("acceptance pool is unavailable");
    const replacementForeignKey = await pool.query<{delete_action: string}>(`
      SELECT confdeltype AS delete_action
      FROM pg_constraint
      WHERE conname = 'member_notes_replaces_note_id_member_notes_id_fk'
    `);
    const renewalIndex = await pool.query<{indexname: string}>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'memberships'
        AND indexname = 'memberships_billing_period_end_idx'
    `);

    expect(replacementForeignKey.rows).toEqual([{delete_action: "n"}]);
    expect(renewalIndex.rows).toEqual([{indexname: "memberships_billing_period_end_idx"}]);

    const replacedNoteId = "50000000-0000-4000-8000-000000000001";
    const replacementNoteId = "50000000-0000-4000-8000-000000000002";
    await pool.query(
      "INSERT INTO member_notes (id,profile_id,author_profile_id,body) VALUES ($1,'m2-risk-01','m2-staff-01','Replacement FK proof')",
      [replacedNoteId],
    );
    try {
      await pool.query(
        "INSERT INTO member_notes (id,profile_id,author_profile_id,body,replaces_note_id) VALUES ($1,'m2-risk-01','m2-staff-01','Replacement child proof',$2)",
        [replacementNoteId, replacedNoteId],
      );
      await pool.query("DELETE FROM member_notes WHERE id=$1", [replacedNoteId]);
      const replacement = await pool.query<{replaces_note_id: string | null}>(
        "SELECT replaces_note_id::text FROM member_notes WHERE id=$1",
        [replacementNoteId],
      );
      expect(replacement.rows).toEqual([{replaces_note_id: null}]);
    } finally {
      await pool.query("DELETE FROM member_notes WHERE id = ANY($1::uuid[])", [[replacementNoteId, replacedNoteId]]);
    }
  });

  it("returns exactly the engineered canonical segment and production at-risk order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(M2_REFERENCE_INSTANT);
    const canonical = parseSegmentRouteQuery({tier: "corporate", status: ["active", "past_due"], scoreMax: "19.99", renewalWithinDays: "60"});
    const preview = await previewSegment(staff, {...canonical, limit: 50, cursor: null});
    expect(preview.items.map(({profileId}) => profileId)).toEqual(M2_AT_RISK_PROFILE_IDS);
    expect(preview.total).toBe(3);

    const atRisk = await listAtRiskMembers(staff, {asOf: M2_REFERENCE_INSTANT});
    expect(atRisk.map(({profileId}) => profileId)).toEqual(M2_AT_RISK_PROFILE_IDS);
  });

  it("proves production member search matching, nonmatching, and stable cursor semantics", async () => {
    const match = await searchAdminMembers(staff, {search: "M2 Risk 02", limit: 10, cursor: null});
    const miss = await searchAdminMembers(staff, {search: "no-such-m2-member", limit: 10, cursor: null});
    const first = await searchAdminMembers(staff, {search: "M2", limit: 2, cursor: null});
    const second = await searchAdminMembers(staff, {search: "M2", limit: 2, cursor: first.nextCursor});
    const combined = [...first.items, ...second.items].map(({profileId}) => profileId);

    expect(match.items.map(({profileId}) => profileId)).toEqual(["m2-risk-02"]);
    expect(miss.items).toEqual([]);
    expect(first.nextCursor).not.toBeNull();
    expect(combined).toEqual([...new Set(combined)]);
    expect(combined).toEqual(["m2-exco-01", "m2-member-04", "m2-member-05", "m2-member-06"]);
  });

  it("correlates suppression to each outer campaign candidate", async () => {
    if (!pool) throw new Error("acceptance pool is unavailable");
    const segmentId = "40000000-0000-4000-8000-000000000001";
    const suppressionId = "40000000-0000-4000-8000-000000000002";
    const idempotencyKey = "40000000-0000-4000-8000-000000000003";
    await pool.query("INSERT INTO saved_segments (id,owner_profile_id,name_en,filter_version,filters) VALUES ($1,$2,$3,1,$4::jsonb)", [
      segmentId, staff.profileId, "Suppression correlation proof", JSON.stringify({profileIds: ["m2-risk-02", "m2-risk-03"], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null}),
    ]);
    await pool.query("INSERT INTO email_log (id,profile_id,template,subject,status) VALUES ($1,'m2-risk-02','suppression-proof','fixture','suppressed')", [suppressionId]);
    try {
      const result = await queueCampaign(staff, {segmentId, template: "renewal-reminder", localeStrategy: "profile", idempotencyKey});
      const recipients = await pool.query<{profile_id: string}>("SELECT profile_id FROM campaign_recipients WHERE campaign_id=$1 ORDER BY profile_id", [result.campaignId]);
      const audits = await pool.query<{recipient_count: number}>("SELECT (metadata->>'recipientCount')::int AS recipient_count FROM audit_events WHERE action='campaign.queued' AND target_id=$1", [result.campaignId]);
      expect(result).toMatchObject({recipientCount: 1, disposition: "created"});
      expect(recipients.rows.map(({profile_id}) => profile_id)).toEqual(["m2-risk-03"]);
      expect(audits.rows).toEqual([{recipient_count: 1}]);
    } finally {
      const campaign = await pool.query<{id: string}>("SELECT id::text FROM campaigns WHERE idempotency_key=$1", [idempotencyKey]);
      for (const {id} of campaign.rows) await pool.query("DELETE FROM audit_events WHERE action='campaign.queued' AND target_id=$1", [id]);
      await pool.query("DELETE FROM campaigns WHERE idempotency_key=$1", [idempotencyKey]);
      await pool.query("DELETE FROM email_log WHERE id=$1", [suppressionId]);
      await pool.query("DELETE FROM saved_segments WHERE id=$1", [segmentId]);
    }
  });

  it("composes a non-empty production Member 360 fixture", async () => {
    const member = await getMember360(staff, "m2-risk-01");
    expect(member.membership).not.toBeNull();
    expect(member.engagement.events.length).toBeGreaterThan(0);
    expect(member.emails.length).toBeGreaterThan(0);
    expect(member.events.length).toBeGreaterThan(0);
    expect(member.notes.length).toBeGreaterThan(0);
  });

  it("seeds one supported pending approval for the browser decision flow", async () => {
    const pending = await listPendingApprovals(staff);
    expect(pending).toHaveLength(2);
    expect(pending.filter(({actionable}) => actionable).map(({id}) => id)).toEqual([M2_UUIDS.approvals[1]]);
  });

  it("matches committed hand-calculated Task 10 report values", async () => {
    const report = await getAdminReport(
      staff,
      {from: "2026-07-01", to: "2026-07-31"},
      undefined,
      M2_REFERENCE_INSTANT,
    );
    expect(report).toEqual({
      window: {from: "2026-07-01", to: "2026-07-31", timezone: "Asia/Hong_Kong"},
      revenue: {arrHkd: 87_600, mrrHkd: 7_300},
      renewal: {numerator: 2, denominator: 4, percentage: 50},
      firstYearRenewal: {numerator: 1, denominator: 2, percentage: 50},
      funnel: {started: 5, profileCompleted: 4, checkoutOrReview: 4, activated: 1},
      attendance: {numerator: 3, denominator: 6, percentage: 50},
      atRiskCount: 3,
    });
  });

  it("contains no personal or production-looking email domain", async () => {
    if (!pool) throw new Error("acceptance pool is unavailable");
    const result = await pool.query<{unsafe_count: number}>(`
      SELECT count(*)::int AS unsafe_count FROM (
        SELECT email FROM profiles WHERE email IS NOT NULL
        UNION ALL
        SELECT email FROM campaign_recipients
      ) fixture_emails
      WHERE split_part(lower(email), '@', 2) NOT LIKE '%.example.test'
    `);
    expect(result.rows[0]?.unsafe_count).toBe(0);
  });
});