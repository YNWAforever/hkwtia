import {execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createAgentRunsRepository} from "@/lib/db/repos/agent-runs";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = `hkwtia-writer-quota-${process.pid}`;
const member = {kind: "member", userId: "user-1", profileId: "profile-1"} as const;
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

describe.skipIf(!enabled)("AI writer quota on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL 16 port was unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    await pool.query("CREATE TABLE profiles (id text PRIMARY KEY)");
    await pool.query(`CREATE TABLE agent_runs (
      id uuid PRIMARY KEY, agent text NOT NULL, conversation_id uuid, profile_id text NOT NULL,
      trigger text NOT NULL, status text NOT NULL, provider text, model text, summary text,
      started_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    )`);
    await pool.query("INSERT INTO profiles (id) VALUES ($1)", [member.profileId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("admits only one of eight simultaneous requests for the final slot", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const repository = createAgentRunsRepository(async () => drizzle(pool!) as never);
    const startedAt = new Date("2026-09-14T04:00:00Z");
    const results = await Promise.all(Array.from({length: 8}, () =>
      repository.reserveWriterRun(member, {cap: 1, startedAt})));
    expect(results.filter((id) => id !== null)).toHaveLength(1);
    expect(results.filter((id) => id === null)).toHaveLength(7);
    const rows = await pool.query<{count: string}>("SELECT count(*)::text AS count FROM agent_runs WHERE profile_id = $1", [member.profileId]);
    expect(rows.rows[0]?.count).toBe("1");
  });

  it("still admits an unlimited Patron run after a finite cap is full", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const repository = createAgentRunsRepository(async () => drizzle(pool!) as never);
    await expect(repository.reserveWriterRun(member, {
      cap: Number.POSITIVE_INFINITY,
      startedAt: new Date("2026-09-14T04:00:00Z"),
    })).resolves.toMatch(/^[0-9a-f-]{36}$/);
    const rows = await pool.query<{count: string}>("SELECT count(*)::text AS count FROM agent_runs WHERE profile_id = $1", [member.profileId]);
    expect(rows.rows[0]?.count).toBe("2");
  });
});
