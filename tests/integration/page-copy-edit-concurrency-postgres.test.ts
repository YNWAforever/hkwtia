import {execFileSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";

import {and, eq, sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {pageCopyRevision, savePageCopy, type PageCopyMutationDependencies} from "@/lib/db/repos/page-copy";
import {auditEvents, pageCopy} from "@/lib/db/server-schema";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-page-copy-edit-" + process.pid;
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const heading = "sections.0.heading";
let pool: Pool | undefined;

function docker(args: string[]): string {
  return execFileSync("docker", args, {encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {docker(["exec", container, "pg_isready", "-U", "postgres"]); return;}
    catch {await delay(100);}
  }
  throw new Error("disposable PostgreSQL did not become ready");
}

function dependencies(database: Pool): PageCopyMutationDependencies {
  const db = drizzle(database);
  return {transaction: (work) => db.transaction(async (tx) => work({
    lockNamespace: async (namespace) => {await tx.execute(sql`SELECT pg_advisory_xact_lock(73083322, hashtext(${namespace}))`);},
    listForNamespace: async (namespace) => tx.select({
      locale: pageCopy.locale, namespace: pageCopy.namespace,
      keyPath: pageCopy.keyPath, value: pageCopy.value,
    }).from(pageCopy).where(eq(pageCopy.namespace, namespace)),
    upsert: async (row) => {await tx.insert(pageCopy).values(row).onConflictDoUpdate({
      target: [pageCopy.locale, pageCopy.namespace, pageCopy.keyPath],
      set: {value: row.value, updatedByProfileId: row.updatedByProfileId, updatedAt: new Date()},
    });},
    remove: async (locale, namespace, keyPath) => {await tx.delete(pageCopy).where(and(
      eq(pageCopy.locale, locale), eq(pageCopy.namespace, namespace), eq(pageCopy.keyPath, keyPath),
    ));},
    insertAudit: async (input) => {await tx.insert(auditEvents).values(input);},
  }))};
}

describe.skipIf(!enabled)("page-copy concurrent edit on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query(`CREATE TABLE page_copy (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      locale varchar(10) NOT NULL, namespace text NOT NULL,
      key_path text NOT NULL, value text NOT NULL,
      updated_by_profile_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(locale, namespace, key_path)
    )`);
    await pool.query(`CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id text, actor_type text, action text,
      target_type text, target_id text, request_id text, metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }, 60_000);

  afterAll(async () => {
    try {if (pool) await pool.end();}
    finally {try {docker(["rm", "-f", container]);} catch {/* Setup may have failed. */}}
  });

  it("allows only one first write across both locales and records one audit", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const mutation = dependencies(pool);
    const revision = pageCopyRevision([]);
    const edit = (label: string) => savePageCopy(staff, {namespace: "Privacy", revision, entries: [
      {locale: "en", keyPath: heading, value: `Privacy edit ${label}`},
      {locale: "zh-HK", keyPath: heading, value: `私隱編輯 ${label}`},
    ]}, mutation);
    const results = await Promise.allSettled([edit("A"), edit("B")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({message: "PAGE_COPY_EDIT_CONFLICT"});
    const values = await pool.query<{locale: string; value: string}>(
      "SELECT locale, value FROM page_copy WHERE namespace='Privacy' ORDER BY locale");
    expect(values.rows).toHaveLength(2);
    expect(values.rows[0]?.value.endsWith("A") && values.rows[1]?.value.endsWith("A") ||
      values.rows[0]?.value.endsWith("B") && values.rows[1]?.value.endsWith("B")).toBe(true);
    const audit = await pool.query("SELECT action FROM audit_events");
    expect(audit.rows).toEqual([{action: "page_copy.updated"}]);
    const accepted = results.find((result) => result.status === "fulfilled");
    if (accepted?.status !== "fulfilled") throw new Error("accepted write missing");
    const followUp = await savePageCopy(staff, {namespace: "Privacy", revision: accepted.value.revision, entries: [
      {locale: "en", keyPath: heading, value: "Privacy follow-up"},
      {locale: "zh-HK", keyPath: heading, value: "私隱續稿"},
    ]}, mutation);
    expect(followUp.updated).toBe(2);
    expect(followUp.revision).not.toBe(accepted.value.revision);
  }, 60_000);
});