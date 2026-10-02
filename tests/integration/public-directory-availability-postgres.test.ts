import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-directory-" + process.pid;
const publishedId = randomUUID();
const hiddenId = randomUUID();
const filters = {q: null, tag: null, plan: null};
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

function repository() {
  return createCompanyProfilesRepository({loadDatabase: async () => drizzle(pool!) as never});
}

describe.skipIf(!enabled)("directory schema upgrade on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port was unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query(`CREATE TABLE companies (
      id uuid PRIMARY KEY, slug text, display_name text NOT NULL,
      tagline_en text, tagline_zh_hk text, tags text[] NOT NULL DEFAULT '{}',
      website text, logo_media_id uuid, public_profile_status text NOT NULL
    )`);
    await pool.query(`CREATE TABLE memberships (
      company_id uuid NOT NULL, plan_code text NOT NULL, status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query("CREATE TABLE media (id uuid PRIMARY KEY, url text, archived_at timestamptz)");
    await pool.query("INSERT INTO companies (id,slug,display_name,public_profile_status) VALUES ($1,'published-one','Published One','published'),($2,'hidden-one','Hidden One','hidden')", [publishedId, hiddenId]);
    await pool.query("INSERT INTO memberships (company_id,plan_code,status) VALUES ($1,'corporate','active'),($2,'patron','active')", [publishedId, hiddenId]);
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("reproduces the old-schema failure and recovers through the shipped additive migration", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    let oldSchemaFailure: unknown;
    try { await repository().listPublished(filters); }
    catch (error) { oldSchemaFailure = error; }
    expect(oldSchemaFailure).toMatchObject({cause: {code: "42703"}});
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0048_membership_grants.sql"), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    await expect(repository().listPublished(filters)).resolves.toMatchObject([
      {id: publishedId, slug: "published-one", name: "Published One", plan: "corporate"},
    ]);
    await pool.query("UPDATE companies SET public_profile_status = 'hidden' WHERE id = $1", [publishedId]);
    await expect(repository().listPublished(filters)).resolves.toEqual([]);
  }, 30_000);
});
