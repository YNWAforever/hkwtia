import {execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createProfileIdentityRepository} from "@/lib/db/repos/profile-identities";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-login-profile-" + process.pid;
let pool: Pool | undefined;
function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}
async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); return; }
    catch { await delay(100); }
  }
  throw new Error("disposable PostgreSQL 16 did not become ready");
}

describe.skipIf(!enabled)("verified auth subject profile provisioning", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query(`CREATE TABLE profiles (
      id text PRIMARY KEY, auth_user_id text NOT NULL UNIQUE, email text,
      role text NOT NULL DEFAULT 'member', display_name text NOT NULL,
      last_login_at timestamptz, consent_marketing boolean NOT NULL DEFAULT false,
      interests text[] NOT NULL DEFAULT '{}'::text[], phone text, job_title text,
      locale varchar(10) NOT NULL DEFAULT 'en', onboarding_state text NOT NULL DEFAULT 'profile',
      directory_visible boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      whatsapp_opt_in boolean NOT NULL DEFAULT false, whatsapp_number text,
      whatsapp_consent_at timestamptz, whatsapp_consent_source text,
      whatsapp_consent_text_version text, marketing_consent_at timestamptz
    )`);
  }, 60_000);
  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("creates one member for a verified subject and never promotes an existing role", async () => {
    const repo = createProfileIdentityRepository(async () => drizzle(pool!) as never);
    await expect(repo.provisionMember({authUserId: "new-subject", email: "new@example.test", displayName: "New Member"}))
      .resolves.toEqual({kind: "ready", identity: {profileId: "new-subject", role: "member"}});
    await expect(repo.provisionMember({authUserId: "new-subject", email: "new@example.test", displayName: "Changed"}))
      .resolves.toEqual({kind: "ready", identity: {profileId: "new-subject", role: "member"}});
    await expect(repo.getDisplayName("new-subject")).resolves.toBe("New Member");
    const rows = await pool!.query("SELECT id, role, display_name FROM profiles WHERE auth_user_id = 'new-subject'");
    expect(rows.rows).toEqual([{id: "new-subject", role: "member", display_name: "New Member"}]);
    await pool!.query("INSERT INTO profiles (id,auth_user_id,email,role,display_name) VALUES ('staff-profile','staff-subject','staff@example.test','staff','Staff')");
    await expect(repo.provisionMember({authUserId: "staff-subject", email: "staff@example.test", displayName: "Other"}))
      .resolves.toEqual({kind: "ready", identity: {profileId: "staff-profile", role: "staff"}});
  });

  it("requires recovery for a same-email different-subject account and never links its role", async () => {
    const repo = createProfileIdentityRepository(async () => drizzle(pool!) as never);
    await pool!.query("INSERT INTO profiles (id,auth_user_id,email,role,display_name) VALUES ('staff-profile','staff-subject','staff@example.test','staff','Staff') ON CONFLICT DO NOTHING");
    await expect(repo.provisionMember({authUserId: "unlinked-subject", email: "STAFF@example.test", displayName: "Other"}))
      .resolves.toEqual({kind: "conflict"});
    const rows = await pool!.query("SELECT id FROM profiles WHERE auth_user_id = 'unlinked-subject'");
    expect(rows.rows).toEqual([]);
  });

  it("serializes simultaneous same-email subjects so only one can create a profile", async () => {
    const repo = createProfileIdentityRepository(async () => drizzle(pool!) as never);
    const outcomes = await Promise.all([
      repo.provisionMember({authUserId: "race-one", email: "race@example.test", displayName: "One"}),
      repo.provisionMember({authUserId: "race-two", email: "race@example.test", displayName: "Two"}),
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["conflict", "ready"]);
    const rows = await pool!.query("SELECT id FROM profiles WHERE lower(email) = 'race@example.test'");
    expect(rows.rows).toHaveLength(1);
  });
});
