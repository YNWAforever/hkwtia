import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {submitMemberEvent} from "@/lib/db/repos/events";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-event-role-${process.pid}`;
const companyId = randomUUID();
const profileId = `event-role-${process.pid}`;
const actor = {kind: "member", userId: profileId, profileId} as const;
const input = {
  slug: "revocation-race", titleEn: "Revocation race", titleZh: null,
  descriptionEn: "An event that must not be submitted after manager revocation.", descriptionZh: null,
  startsAt: new Date("2030-03-01T02:00:00Z"), endsAt: null, venue: "Hong Kong", capacity: 20,
  format: "in_person" as const, onlineUrl: null, visibility: "public" as const,
  registrationMode: "rsvp" as const, externalRegistrationUrl: null, tags: [], heroMediaId: null,
};
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      docker(["exec", container, "pg_isready", "-U", "postgres"]);
      return;
    } catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

async function waitForMembershipLock(pool: Pool, revokerPid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const {rows} = await pool.query<{blocked: boolean}>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND $1::integer = ANY(pg_blocking_pids(pid))
          AND query ILIKE '%memberships%'
          AND query ILIKE '%FOR UPDATE%'
      ) AS blocked
    `, [revokerPid]);
    if (rows[0]?.blocked) return;
    await delay(50);
  }
  throw new Error("event submission never waited on the revoker's membership lock");
}

describe.skipIf(!enabled)("member event role revocation on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    await pool.query(`
      CREATE TABLE memberships (company_id uuid PRIMARY KEY, plan_code text NOT NULL, status text NOT NULL);
      CREATE TABLE company_members (
        company_id uuid NOT NULL, user_id text NOT NULL, role text NOT NULL, revoked_at timestamptz,
        PRIMARY KEY (company_id, user_id)
      );
    `);
    await pool.query("INSERT INTO memberships (company_id, plan_code, status) VALUES ($1, 'startup', 'active')", [companyId]);
    await pool.query("INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'admin')", [companyId, profileId]);
  }, 60_000);

  afterAll(async () => {
    try {
      if (pool) await pool.end();
    } finally {
      try { docker(["rm", "-f", container]); } catch { /* Setup may have failed before container creation. */ }
    }
  });

  it("denies a submission after seat revocation wins the membership lock", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const revoker = await pool.connect();
    let result: Promise<string> | undefined;
    let committed = false;
    try {
      await revoker.query("BEGIN");
      await revoker.query("SELECT company_id FROM memberships WHERE company_id = $1 FOR UPDATE", [companyId]);
      await revoker.query("UPDATE company_members SET revoked_at = now() WHERE company_id = $1 AND user_id = $2", [companyId, profileId]);
      const revokerPid = (await revoker.query<{pid: number}>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;
      if (!revokerPid) throw new Error("revoker PostgreSQL PID was unavailable");

      let settled = false;
      result = submitMemberEvent(actor, companyId, input, {
        getCompanyRole: async () => "admin", // The preflight read preceded the revocation.
        loadDatabase: async () => drizzle(pool!) as never,
      }).then(() => "wrote", (error: unknown) => error instanceof Error ? error.message : String(error))
        .finally(() => {settled = true;});
      await waitForMembershipLock(pool, revokerPid);
      expect(settled).toBe(false);
      await revoker.query("COMMIT");
      committed = true;
      expect(await result).toBe("FORBIDDEN");
    } finally {
      try {
        if (!committed) await revoker.query("ROLLBACK");
      } finally {
        revoker.release();
        if (result) await result;
      }
    }
  }, 20_000);
});