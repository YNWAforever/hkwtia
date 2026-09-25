import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createShowcaseRepository, databaseStore} from "@/lib/db/repos/showcase";
import type {AdminActor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-showcase-review-" + process.pid;
const listingId = randomUUID();
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

async function waitForReviewWrite(database: Pool, blockerPid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const {rows} = await database.query<{blocked: boolean}>(`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND $1::integer = ANY(pg_blocking_pids(pid))
          AND query ILIKE '%showcase_listings%' AND query ILIKE '%UPDATE%') AS blocked
    `, [blockerPid]);
    if (rows[0]?.blocked) return;
    await delay(50);
  }
  throw new Error("showcase review never waited on the listing lock");
}

describe.skipIf(!enabled)("showcase review transition on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query(`CREATE TABLE showcase_listings (
      id uuid PRIMARY KEY, company_id uuid NOT NULL, slug text NOT NULL, status text NOT NULL,
      premium boolean NOT NULL DEFAULT false, gone_global boolean NOT NULL DEFAULT false,
      views integer NOT NULL DEFAULT 0, member_since date NOT NULL,
      name_en text NOT NULL, name_zh_hk text NOT NULL, tagline_en text NOT NULL,
      tagline_zh_hk text NOT NULL, description_en text NOT NULL, description_zh_hk text NOT NULL,
      category text NOT NULL, use_cases text[] NOT NULL DEFAULT '{}',
      deployment_options text[] NOT NULL DEFAULT '{}', supported_languages text[] NOT NULL DEFAULT '{}',
      works_with text[] NOT NULL DEFAULT '{}', video_url text, case_study_url text,
      case_study_summary_en text, case_study_summary_zh_hk text, logo_reference text,
      logo_media_id uuid, reviewed_at timestamptz, reviewed_by_profile_id text,
      rejection_reason text, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query("CREATE TABLE media (id uuid PRIMARY KEY, url text, alt_en text, alt_zh text)");
    await pool.query(`INSERT INTO showcase_listings
      (id, company_id, slug, status, member_since, name_en, name_zh_hk,
       tagline_en, tagline_zh_hk, description_en, description_zh_hk, category)
      VALUES ($1, $2, 'review-race', 'pending_review', '2020-01-01',
       'Original', '原本', 'Tagline', '標語', 'Description', '描述', 'software')`,
    [listingId, randomUUID()]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("refuses a stale staff decision after a member resubmits pending content", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE showcase_listings SET status = 'pending_review', description_en = 'Original' WHERE id = $1", [listingId]);
    const repo = createShowcaseRepository({store: databaseStore(async () => drizzle(pool!) as never)});
    const staff = {kind: "staff", userId: "staff", profileId: "staff"} as AdminActor;
    const reviewedVersion = (await repo.listForReview(staff)).find((row) => row.id === listingId)?.reviewVersion;
    expect(reviewedVersion).toMatch(/^\d+$/);
    await pool.query("UPDATE showcase_listings SET status = 'pending_review', description_en = 'Unreviewed change' WHERE id = $1", [listingId]);
    await expect(repo.publish(staff, listingId, reviewedVersion!)).rejects.toThrow("INVALID_SHOWCASE_TRANSITION");
    const {rows} = await pool.query<{status: string; description_en: string}>(
      "SELECT status, description_en FROM showcase_listings WHERE id = $1", [listingId],
    );
    expect(rows[0]).toMatchObject({status: "pending_review", description_en: "Unreviewed change"});
  });
  it.each(["publish", "reject"] as const)("does not %s after a concurrent member draft wins the listing lock", async (decision) => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    await pool.query("UPDATE showcase_listings SET status = 'pending_review' WHERE id = $1", [listingId]);
    const store = databaseStore(async () => drizzle(pool!) as never);
    const repo = createShowcaseRepository({store});
    const staff = {kind: "staff", userId: "staff", profileId: "staff"} as AdminActor;
    const reviewedVersion = (await repo.listForReview(staff)).find((row) => row.id === listingId)?.reviewVersion;
    expect(reviewedVersion).toMatch(/^\d+$/);
    const editor = await pool.connect();
    let result: Promise<string> | undefined;
    let committed = false;
    try {
      await editor.query("BEGIN");
      await editor.query("SELECT id FROM showcase_listings WHERE id = $1 FOR UPDATE", [listingId]);
      await editor.query("UPDATE showcase_listings SET status = 'draft' WHERE id = $1", [listingId]);
      const blockerPid = (await editor.query<{pid: number}>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      if (!blockerPid) throw new Error("editor PostgreSQL PID was unavailable");
      const decisionResult = decision === "publish"
        ? repo.publish(staff, listingId, reviewedVersion!)
        : repo.reject(staff, listingId, "Needs changes", reviewedVersion!);
      result = decisionResult.then(
        (row) => row?.status ?? "missing",
        (error: unknown) => error instanceof Error ? error.message : String(error),
      );
      await waitForReviewWrite(pool, blockerPid);
      await editor.query("COMMIT");
      committed = true;
      expect(await result).toBe("INVALID_SHOWCASE_TRANSITION");
      const {rows} = await pool.query<{status: string}>("SELECT status FROM showcase_listings WHERE id = $1", [listingId]);
      expect(rows[0]?.status).toBe("draft");
    } finally {
      try { if (!committed) await editor.query("ROLLBACK"); }
      finally { editor.release(); if (result) await result; }
    }
  }, 20_000);
});
