import {execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {createProfileIdentityRepository} from "@/lib/db/repos/profile-identities";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-auth-touch-" + process.pid;
let pool: Pool | undefined;
function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}
async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

describe.skipIf(!enabled)("bounded last-login writes", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query("CREATE TABLE profiles (id text PRIMARY KEY, last_login_at timestamptz)");
    await pool.query("INSERT INTO profiles(id,last_login_at) VALUES ('recent',now()-interval '1 minute'),('stale',now()-interval '1 hour')");
  }, 60_000);
  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("does not rewrite a recent login, updates stale login, and stays actor-scoped", async () => {
    const repo = createProfileIdentityRepository(async () => drizzle(pool!) as never);
    const before = await pool!.query("SELECT id,last_login_at FROM profiles ORDER BY id");
    await repo.touchLastLogin("recent");
    await repo.touchLastLogin("stale");
    const after = await pool!.query("SELECT id,last_login_at FROM profiles ORDER BY id");
    expect(after.rows[0].last_login_at).toEqual(before.rows[0].last_login_at);
    expect(after.rows[1].last_login_at.getTime()).toBeGreaterThan(before.rows[1].last_login_at.getTime());
  });
});
