import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-directory-page-" + process.pid;
const filters = {q: null, tag: null, plan: null};
let pool: Pool | undefined;
const ids = Array.from({length: 5}, () => randomUUID());

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
function repository() {
  return createCompanyProfilesRepository({loadDatabase: async () => drizzle(pool!) as never});
}

describe.skipIf(!enabled)("public directory cursor on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query("CREATE TABLE companies (id uuid PRIMARY KEY, slug text, display_name text NOT NULL, tagline_en text, tagline_zh_hk text, tags text[] NOT NULL DEFAULT '{}', website text, logo_media_id uuid, public_profile_status text NOT NULL)");
    await pool.query("CREATE TABLE memberships (company_id uuid NOT NULL, plan_code text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), grant_effective_at timestamptz, grant_expires_at timestamptz)");
    await pool.query("CREATE TABLE media (id uuid PRIMARY KEY, url text, archived_at timestamptz)");
    for (let index = 0; index < ids.length; index += 1) {
      await pool.query("INSERT INTO companies (id,slug,display_name,public_profile_status,tags) VALUES ($1,$2,$3,$4,$5)", [ids[index], "member-" + index, index < 3 ? "Same Name" : "Zulu " + index, index === 4 ? "hidden" : "published", index === 3 ? ["ai"] : []]);
      await pool.query("INSERT INTO memberships (company_id,plan_code,status) VALUES ($1,$2,'active')", [ids[index], index === 0 ? "corporate" : "community"]);
    }
  }, 60_000);

  afterAll(async () => {
    try { if (pool) await pool.end(); }
    finally { try { docker(["rm", "-f", container]); } catch { /* Setup may have failed. */ } }
  });

  it("visits each published row once with a stable same-name tie break", async () => {
    const first = await repository().listPublishedPage(filters, null, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await repository().listPublishedPage(filters, first.nextCursor, 2);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const observed = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(observed).size).toBe(4);
    expect(observed[0]).toBe(ids[0]);
    expect(observed.slice(1, 3)).toEqual([ids[1], ids[2]].sort());
  });

  it("binds the cursor to filters and bounds its SQL result size", async () => {
    const first = await repository().listPublishedPage(filters, null, 1);
    const filtered = await repository().listPublishedPage({...filters, tag: "ai"}, first.nextCursor, 1000);
    expect(filtered.items.map((item) => item.slug)).toEqual(["member-3"]);
    const capped = await repository().listPublishedPage(filters, null, 1000);
    expect(capped.items).toHaveLength(4);
    expect(capped.nextCursor).toBeNull();
  });
});
