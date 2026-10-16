import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";

import type {BatchDatabase} from "@/lib/db/repos/admin-batches";

const container = `hkwtia-admin-batch-${process.pid}-${randomUUID().slice(0, 6)}`;
function docker(args: string[]) {return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});}
export async function isolatedBatchDatabase() {
  docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
  let pool: Pool | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); break;} catch {await delay(100);}
    }
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: `postgresql://postgres:test@127.0.0.1:${port}/postgres?sslmode=disable`});
    // Docker's in-container pg_isready can precede readiness through the published host port.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {await pool.query("SELECT 1"); break;}
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (attempt === 29 || !["57P03", "ECONNREFUSED"].includes(code)) throw error;
        await delay(200);
      }
    }
    await pool.query(`
      CREATE TABLE profiles (id text PRIMARY KEY, display_name text NOT NULL, email text, phone text, job_title text, locale text NOT NULL, role text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE companies (id uuid PRIMARY KEY, display_name text NOT NULL);
      CREATE TABLE company_members (user_id text NOT NULL, company_id uuid NOT NULL, revoked_at timestamptz);
      CREATE TABLE membership_plans (code text PRIMARY KEY, seat_allowance integer NOT NULL);
      CREATE TABLE memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id text, company_id uuid, plan_code text NOT NULL, status text NOT NULL, seat_limit integer NOT NULL DEFAULT 0, billing_period_end timestamptz, stripe_customer_id text, stripe_subscription_id text, updated_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX memberships_owner_live_unique ON memberships (owner_user_id) WHERE owner_user_id IS NOT NULL AND status NOT IN ('cancelled','expired');
      CREATE TABLE engagement_scores (profile_id text PRIMARY KEY, score numeric NOT NULL);
      CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id text, display_name text, email text, source text, stage text, owner_profile_id text, tags text[] NOT NULL DEFAULT ARRAY[]::text[], locale text NOT NULL DEFAULT 'en', whatsapp_opt_in boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_type text NOT NULL, action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO profiles (id,display_name,email,phone,job_title,locale,role) VALUES ('root','Root','root@example.test','0','Superadmin','en','superadmin'),('staff','Staff','staff@example.test','1','Staff','en','staff'),('a','Ada','a@example.test','2','Member','en','member'),('b','Bea','b@example.test','3','Member','en','member'),('grant-c','Cai','c@example.test','4','Member','en','member'),('grant-d','Dee','d@example.test','5','Member','en','member');
      INSERT INTO membership_plans (code,seat_allowance) VALUES ('community',1),('startup',3),('corporate',12),('patron',20);
      INSERT INTO memberships (id,owner_user_id,plan_code,status) VALUES ('11111111-1111-4111-8111-111111111111','a','community','active'),('22222222-2222-4222-8222-222222222222','b','community','active');
    `);
    const migration = readFileSync("drizzle/0046_admin_batches.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) await pool.query(statement);
    const importMigration = readFileSync("drizzle/0047_member_imports.sql", "utf8");
    for (const statement of importMigration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) await pool.query(statement);
    const grantMigration = readFileSync("drizzle/0048_membership_grants.sql", "utf8");
    for (const statement of grantMigration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) await pool.query(statement);
    const database = drizzle(pool) as unknown as BatchDatabase;
    return {pool, database, close: async () => {await pool!.end(); docker(["rm", "-f", container]);}};
  } catch (error) {
    if (pool) await pool.end();
    try {docker(["rm", "-f", container]);} catch {/* Setup may have failed before container creation. */}
    throw error;
  }
}
