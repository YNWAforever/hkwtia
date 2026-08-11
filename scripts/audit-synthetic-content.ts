import {fileURLToPath} from "node:url";

import {Pool} from "pg";

import {COMPANY_IDS as M5_COMPANY_IDS, LISTING_IDS as M5_LISTING_IDS} from "./seed-m5.ts";
import {
  APPLICATION_IDS as M6_APPLICATION_IDS,
  COHORT_ID as M6_COHORT_ID,
  COMPANY_IDS as M6_COMPANY_IDS,
  PARTNER_IDS as M6_PARTNER_IDS,
} from "./seed-m6.ts";
import {M2_PROFILE_ROWS, M2_UUIDS} from "./seed-m2.ts";
import {M3_PROFILE_IDS, M3_SEED_UUIDS} from "./seed-m3.ts";

/**
 * Read-only inventory (default) plus two opt-in mutation phases for the
 * synthetic fixture rows that milestone acceptance seeds (M2, M3, M5, M6)
 * wrote into what is now a live database, before the isolation guard
 * (832d6b4..42103c4) closed off further re-seeding.
 *
 * Every id below is imported from the seed module that generated it rather
 * than copied, so this file cannot drift from what a seed actually writes.
 * M1 is excluded by design: `membership_plans` are real product
 * configuration (see AGENTS.md's "four stable plan rows"), not synthetic
 * identity, and `tests/unit/seed-guard-boundary.test.ts` encodes the same
 * exemption for the seeds themselves.
 *
 * M4A/M4B/M4C are also excluded: they seed AI-Ops/Concierge acceptance
 * fixtures (conversations, agent runs, knowledge-base chunks, and — for
 * M4C — two "buildlog" posts) that were out of the scope this tool was
 * commissioned to cover, and their buildlog posts read as genuine
 * engineering changelog content rather than the fictional demo content this
 * tool targets. See the audit's own report for the reasoning; this is a
 * documented scope boundary, not an oversight.
 *
 * No seed in scope (M2, M3, M5, M6) writes a `posts` row at all, so there is
 * no source-verified marker for "the demo news post" mentioned in the
 * launch-safety brief. `postKindEnum` (news/buildlog/page) also turns out
 * not to gate public visibility the way the brief assumed — `lib/db/repos/
 * public-posts.ts` gates on `published_at IS NOT NULL AND published_at <=
 * now()`, independent of `kind`. If a synthetic news post exists live, it
 * has to be found by inspecting `posts` directly (e.g. via the admin panel);
 * inventing an id-less marker here would reintroduce exactly the
 * false-positive risk this design otherwise avoids.
 */

export type MarkerValueType = "uuid" | "text";

export type SyntheticMarker = Readonly<{
  table: string;
  matchColumn: string;
  matchType: MarkerValueType;
  rowIdExpr: string;
  ids: readonly string[];
  source: string;
}>;

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/**
 * The full marker set. Every `ids` array traces to an exported seed
 * constant — see the imports above — never a literal UUID typed into this
 * file, so a seed's id list changing can't silently desync from what this
 * tool looks for.
 */
export function buildSyntheticMarkers(): readonly SyntheticMarker[] {
  const m2ProfileIds = dedupe(M2_PROFILE_ROWS.map((row) => row.id));
  const m3ProfileIds = dedupe(Object.values(M3_PROFILE_IDS));
  const m3JourneyIds = dedupe([...Object.values(M3_SEED_UUIDS.journeys), M3_SEED_UUIDS.concurrentJourney]);

  return [
    // --- M5: fictional showcase listings ---
    {table: "companies", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M5_COMPANY_IDS, source: "scripts/seed-m5.ts COMPANY_IDS"},
    {table: "showcase_listings", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M5_LISTING_IDS, source: "scripts/seed-m5.ts LISTING_IDS"},
    {table: "leads", matchColumn: "listing_id", matchType: "uuid", rowIdExpr: "id", ids: M5_LISTING_IDS, source: "scripts/seed-m5.ts LISTING_IDS (leads.listing_id)"},

    // --- M6: demo Launch Pad cohort ---
    {table: "cohorts", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M6_COHORT_ID], source: "scripts/seed-m6.ts COHORT_ID"},
    {table: "companies", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M6_COMPANY_IDS, source: "scripts/seed-m6.ts COMPANY_IDS"},
    {table: "landing_partners", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M6_PARTNER_IDS, source: "scripts/seed-m6.ts PARTNER_IDS"},
    {table: "cohort_applications", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M6_APPLICATION_IDS, source: "scripts/seed-m6.ts APPLICATION_IDS"},

    // --- M2: 30 .example.test profiles and their CRM fixture rows ---
    {table: "profiles", matchColumn: "id", matchType: "text", rowIdExpr: "id", ids: m2ProfileIds, source: "scripts/seed-m2.ts M2_PROFILE_ROWS"},
    {table: "companies", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.companies, source: "scripts/seed-m2.ts M2_UUIDS.companies"},
    {table: "company_members", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.companyMembers, source: "scripts/seed-m2.ts M2_UUIDS.companyMembers"},
    {table: "membership_applications", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.applications, source: "scripts/seed-m2.ts M2_UUIDS.applications"},
    {table: "memberships", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.memberships, source: "scripts/seed-m2.ts M2_UUIDS.memberships"},
    {table: "engagement_scores", matchColumn: "profile_id", matchType: "text", rowIdExpr: "profile_id", ids: m2ProfileIds, source: "scripts/seed-m2.ts M2_PROFILE_ROWS (engagement_scores.profile_id)"},
    {table: "engagement_events", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.engagementEvents, source: "scripts/seed-m2.ts M2_UUIDS.engagementEvents"},
    {table: "member_notes", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.notes, source: "scripts/seed-m2.ts M2_UUIDS.notes"},
    {table: "email_log", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.emails, source: "scripts/seed-m2.ts M2_UUIDS.emails"},
    {table: "events", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.events, source: "scripts/seed-m2.ts M2_UUIDS.events"},
    {table: "event_registrations", matchColumn: "event_id", matchType: "uuid", rowIdExpr: "event_id || ':' || profile_id", ids: M2_UUIDS.events, source: "scripts/seed-m2.ts M2_UUIDS.events (event_registrations.event_id)"},
    {table: "saved_segments", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.segments, source: "scripts/seed-m2.ts M2_UUIDS.segments"},
    {table: "campaigns", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.campaigns, source: "scripts/seed-m2.ts M2_UUIDS.campaigns"},
    {table: "campaign_recipients", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.recipients, source: "scripts/seed-m2.ts M2_UUIDS.recipients"},
    {table: "approvals", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: M2_UUIDS.approvals, source: "scripts/seed-m2.ts M2_UUIDS.approvals"},

    // --- M3: 9 named .example.test profiles and their CRM fixture rows ---
    {table: "profiles", matchColumn: "id", matchType: "text", rowIdExpr: "id", ids: m3ProfileIds, source: "scripts/seed-m3.ts M3_PROFILE_IDS"},
    {table: "memberships", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: Object.values(M3_SEED_UUIDS.memberships), source: "scripts/seed-m3.ts M3_SEED_UUIDS.memberships"},
    {table: "journey_state", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: m3JourneyIds, source: "scripts/seed-m3.ts M3_SEED_UUIDS.journeys"},
    {table: "message_suppressions", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.suppression], source: "scripts/seed-m3.ts M3_SEED_UUIDS.suppression"},
    {table: "engagement_events", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.engagementEvent], source: "scripts/seed-m3.ts M3_SEED_UUIDS.engagementEvent"},
    {table: "engagement_scores", matchColumn: "profile_id", matchType: "text", rowIdExpr: "profile_id", ids: m3ProfileIds, source: "scripts/seed-m3.ts M3_PROFILE_IDS (engagement_scores.profile_id)"},
    {table: "email_log", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.failedEmail], source: "scripts/seed-m3.ts M3_SEED_UUIDS.failedEmail"},
    {table: "saved_segments", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.segment], source: "scripts/seed-m3.ts M3_SEED_UUIDS.segment"},
    {table: "campaigns", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.campaign], source: "scripts/seed-m3.ts M3_SEED_UUIDS.campaign"},
    {table: "campaign_recipients", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: Object.values(M3_SEED_UUIDS.campaignRecipients), source: "scripts/seed-m3.ts M3_SEED_UUIDS.campaignRecipients"},
    {table: "approvals", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.approval], source: "scripts/seed-m3.ts M3_SEED_UUIDS.approval"},
    {table: "jobs", matchColumn: "id", matchType: "uuid", rowIdExpr: "id", ids: [M3_SEED_UUIDS.failedJob], source: "scripts/seed-m3.ts M3_SEED_UUIDS.failedJob"},
  ];
}

/**
 * Deepest children first, so `--delete` never depends on a `FOREIGN KEY ...
 * ON DELETE CASCADE`/`RESTRICT` choice made for unrelated reasons elsewhere
 * in `lib/db/schema-core.ts`. Modeled on the explicit child-then-parent
 * ordering `scripts/seed-m5.ts` already uses at its own delete site
 * (`leads` before `showcase_listings` before `companies`).
 *
 * Verified against every `.references(...)` in schema-core.ts: `profiles`
 * and `companies` are last because other marker tables reference them with
 * `ON DELETE RESTRICT` (e.g. `campaign_recipients.profile_id`,
 * `campaigns.created_by_profile_id`, `saved_segments.owner_profile_id`,
 * `member_notes.author_profile_id`) that would otherwise abort the delete.
 */
export const DELETE_ORDER: readonly string[] = [
  "leads",
  "campaign_recipients",
  "approvals",
  "campaigns",
  "saved_segments",
  "event_registrations",
  "events",
  "jobs",
  "email_log",
  "message_suppressions",
  "journey_state",
  "member_notes",
  "engagement_events",
  "engagement_scores",
  "memberships",
  "membership_applications",
  "company_members",
  "cohort_applications",
  "showcase_listings",
  "cohorts",
  "landing_partners",
  "companies",
  "profiles",
];

/**
 * The tables with an actual public-visibility gate, and the non-public value
 * this tool moves them to. Read directly from lib/db/schema-core.ts and the
 * repositories that query it (not guessed):
 *  - showcase_listings.status -> "draft": the schema's own default, and the
 *    neutral "not submitted" state — unlike "rejected" it doesn't assert a
 *    staff decision that never happened. Public gate: `lib/db/repos/
 *    showcase.ts` reads only `status = 'published'`.
 *  - cohorts.status -> "archived": public gate is `status IN ('open',
 *    'active')` (`lib/db/repos/cohorts.ts` PUBLIC_COHORT_STATUSES).
 *    "archived" reads as "retired" rather than "still being planned"
 *    ("planning" would).
 *  - events.published -> false: boolean, not an enum; public gate is
 *    `lib/db/repos/events.ts` filtering on `published && !memberOnly`.
 *
 * `companies` and `landing_partners` are deliberately absent: `companies.
 * directory_visible` is read only by a Server Action behind
 * `requireActor()` and by tests (confirmed by reading every caller of
 * `companiesRepository`) — no anonymous request can reach it, so there is
 * no public state to flip. `landing_partners` has no repository file at
 * all; the public Launch Pad page renders a curated static JSON
 * (`config/landing-partners.json`) instead, so the DB table is never read
 * publicly either.
 */
export const HIDE_STATEMENTS: readonly Readonly<{table: string; sql: string; matchType: MarkerValueType}>[] = [
  {
    table: "showcase_listings",
    sql: "UPDATE showcase_listings SET status = 'draft'::showcase_listing_status, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
    matchType: "uuid",
  },
  {
    table: "cohorts",
    sql: "UPDATE cohorts SET status = 'archived'::cohort_status, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
    matchType: "uuid",
  },
  {
    table: "events",
    sql: "UPDATE events SET published = false, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
    matchType: "uuid",
  },
];

export type InventoryRow = Readonly<{table: string; rowId: string; source: string}>;

export type AuditConnection = Readonly<{
  query: (text: string, values?: readonly unknown[]) => Promise<{rows?: readonly Record<string, unknown>[]}>;
}>;
export type AuditPool = Readonly<{connect: () => Promise<AuditConnection & Readonly<{release: () => void}>>}>;

function mergeMarkersFor(
  table: string,
  markers: readonly SyntheticMarker[],
): Readonly<{matchColumn: string; matchType: MarkerValueType; ids: readonly string[]}> | null {
  const matching = markers.filter((marker) => marker.table === table);
  if (matching.length === 0) return null;
  const [first, ...rest] = matching;
  if (!first) return null;
  for (const marker of rest) {
    if (marker.matchColumn !== first.matchColumn || marker.matchType !== first.matchType) {
      // Every table in the marker set is matched through exactly one
      // column, by construction (see buildSyntheticMarkers). A mismatch
      // here means a new marker broke that invariant, not a data problem.
      throw new Error(`AUDIT_MARKER_COLUMN_MISMATCH:${table}`);
    }
  }
  const ids = dedupe(matching.flatMap((marker) => marker.ids));
  return {matchColumn: first.matchColumn, matchType: first.matchType, ids};
}

/**
 * The read-only default. Every statement here is a SELECT: this function
 * mutates nothing, so it is safe to run against the live database with no
 * flags to see what `--hide`/`--delete` would act on.
 */
export async function inventorySyntheticRows(
  connection: AuditConnection,
  markers: readonly SyntheticMarker[] = buildSyntheticMarkers(),
): Promise<readonly InventoryRow[]> {
  const rows: InventoryRow[] = [];
  for (const marker of markers) {
    if (marker.ids.length === 0) continue;
    const result = await connection.query(
      `SELECT ${marker.rowIdExpr} AS row_id FROM ${marker.table} WHERE ${marker.matchColumn} = ANY($1::${marker.matchType}[])`,
      [marker.ids],
    );
    for (const row of result.rows ?? []) {
      rows.push({table: marker.table, rowId: String(row.row_id), source: marker.source});
    }
  }
  return rows;
}

export type MutationResult = Readonly<{table: string; count: number}>;

/**
 * Flips publication/approval state so nothing synthetic stays publicly
 * reachable. Reversible: it only ever UPDATEs, never removes a row, and the
 * operator can restore the original status by hand if a hide turns out to
 * have been premature.
 */
export async function hideSyntheticContent(
  connection: AuditConnection,
  markers: readonly SyntheticMarker[] = buildSyntheticMarkers(),
): Promise<readonly MutationResult[]> {
  const results: MutationResult[] = [];
  for (const statement of HIDE_STATEMENTS) {
    const merged = mergeMarkersFor(statement.table, markers);
    if (!merged || merged.ids.length === 0) continue;
    const result = await connection.query(statement.sql, [merged.ids]);
    results.push({table: statement.table, count: result.rows?.length ?? 0});
  }
  return results;
}

export class AuditDeleteCountMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`AUDIT_DELETE_COUNT_MISMATCH: expected CONFIRM_DELETE_COUNT=${actual}, got ${expected}`);
    this.name = "AuditDeleteCountMismatchError";
  }
}

/**
 * Removes the rows for good, in `DELETE_ORDER` (children before parents),
 * inside one transaction. Refuses to run unless `confirmDeleteCount` equals
 * a freshly-recomputed inventory count taken inside the same transaction —
 * a command built from a stale inventory (because someone else already
 * hid/deleted rows, or a seed guard gap let new synthetic rows appear)
 * aborts instead of deleting a set nobody actually reviewed.
 */
export async function deleteSyntheticContent(
  connection: AuditConnection,
  options: Readonly<{confirmDeleteCount: number}>,
  markers: readonly SyntheticMarker[] = buildSyntheticMarkers(),
): Promise<readonly MutationResult[]> {
  await connection.query("BEGIN");
  try {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["hkwtia:audit-synthetic-content"]);
    const currentInventory = await inventorySyntheticRows(connection, markers);
    if (currentInventory.length !== options.confirmDeleteCount) {
      throw new AuditDeleteCountMismatchError(currentInventory.length, options.confirmDeleteCount);
    }

    const results: MutationResult[] = [];
    for (const table of DELETE_ORDER) {
      const merged = mergeMarkersFor(table, markers);
      if (!merged || merged.ids.length === 0) continue;
      const result = await connection.query(
        `DELETE FROM ${table} WHERE ${merged.matchColumn} = ANY($1::${merged.matchType}[]) RETURNING ${merged.matchColumn}`,
        [merged.ids],
      );
      results.push({table, count: result.rows?.length ?? 0});
    }

    await connection.query("COMMIT");
    return results;
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

function printInventory(rows: readonly InventoryRow[]): void {
  if (rows.length === 0) {
    console.log("No synthetic rows found.");
    return;
  }
  console.log(`table\trow_id\tmarker`);
  for (const row of rows) {
    console.log(`${row.table}\t${row.rowId}\t${row.source}`);
  }
  console.log(`\n${rows.length} synthetic row(s) found. Re-run with CONFIRM_DELETE_COUNT=${rows.length} --delete to remove them, or --hide to hide them first.`);
}

function printMutationResults(label: string, results: readonly MutationResult[]): void {
  const total = results.reduce((sum, {count}) => sum + count, 0);
  for (const {table, count} of results) console.log(`${label} ${table}: ${count}`);
  console.log(`${label} total: ${total}`);
}

export type AuditMode = "inventory" | "hide" | "delete";

export function parseAuditMode(argv: readonly string[]): AuditMode {
  const hasHide = argv.includes("--hide");
  const hasDelete = argv.includes("--delete");
  if (hasHide && hasDelete) throw new Error("AUDIT_FLAGS_EXCLUSIVE: pass at most one of --hide, --delete");
  if (hasDelete) return "delete";
  if (hasHide) return "hide";
  return "inventory";
}

function parseConfirmDeleteCount(environment: Readonly<Record<string, string | undefined>>): number {
  const raw = environment.CONFIRM_DELETE_COUNT?.trim();
  if (!raw) throw new Error("AUDIT_CONFIRM_DELETE_COUNT_REQUIRED: set CONFIRM_DELETE_COUNT to the row count the inventory reported");
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error("AUDIT_CONFIRM_DELETE_COUNT_INVALID");
  return value;
}

type SeedPoolWithEnd = AuditPool & Readonly<{end: () => Promise<void>}>;

export async function runAuditCli(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  argv: readonly string[] = process.argv.slice(2),
  createPool: (databaseUrl: string) => SeedPoolWithEnd = (databaseUrl) =>
    new Pool({connectionString: databaseUrl}) as unknown as SeedPoolWithEnd,
): Promise<void> {
  const mode = parseAuditMode(argv);
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required to audit the database.");

  const pool = createPool(databaseUrl);
  const connection = await pool.connect();
  try {
    if (mode === "inventory") {
      printInventory(await inventorySyntheticRows(connection));
      return;
    }
    if (mode === "hide") {
      printMutationResults("hidden", await hideSyntheticContent(connection));
      return;
    }
    const confirmDeleteCount = parseConfirmDeleteCount(environment);
    printMutationResults("deleted", await deleteSyntheticContent(connection, {confirmDeleteCount}));
  } finally {
    connection.release();
    await pool.end();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()) {
  runAuditCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`Synthetic content audit failed: ${message}`);
    process.exitCode = 1;
  });
}
