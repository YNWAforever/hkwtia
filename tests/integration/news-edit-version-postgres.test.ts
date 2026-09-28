import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {and, eq} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {updateNewsPost, type NewsMutationDependencies} from "@/lib/db/repos/admin-posts";
import {auditEvents, posts} from "@/lib/db/server-schema";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-news-edit-" + process.pid;
const postId = randomUUID();
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
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

function mutationDependencies(database: Pool): NewsMutationDependencies {
  const db = drizzle(database);
  return {transaction: (work) => db.transaction(async (tx) => work({
    findBySlug: async (slug) =>
      (await tx.select({id: posts.id}).from(posts).where(eq(posts.slug, slug)).limit(1))[0] ?? null,
    insertPost: async (input) => {
      const [row] = await tx.insert(posts).values({...input, kind: "news"}).returning();
      if (!row) throw new Error("NEWS_INSERT_FAILED");
      return row;
    },
    lockPost: async (id) =>
      (await tx.select().from(posts).where(and(eq(posts.id, id), eq(posts.kind, "news"))).for("update"))[0] ?? null,
    updatePost: async (id, input, updatedAt) =>
      (await tx.update(posts).set({...input, updatedAt}).where(and(eq(posts.id, id), eq(posts.kind, "news"))).returning())[0] ?? null,
    setArchivedAt: async (id, archivedAt, updatedAt) =>
      (await tx.update(posts).set({archivedAt, updatedAt}).where(and(eq(posts.id, id), eq(posts.kind, "news"))).returning())[0] ?? null,
    insertAudit: async (input) => {await tx.insert(auditEvents).values(input);},
  }))};
}

describe.skipIf(!enabled)("news edit version on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query(`CREATE TABLE posts (
      id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, kind text NOT NULL,
      title_en text NOT NULL, title_zh text NOT NULL,
      body_mdx text NOT NULL, body_mdx_zh_hk text,
      published_at timestamptz, archived_at timestamptz,
      author text NOT NULL, source_key text, agent_run_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL
    )`);
    await pool.query(`CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_user_id text, actor_type text, action text,
      target_type text, target_id text, request_id text, metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`INSERT INTO posts
      (id, slug, kind, title_en, title_zh, body_mdx, body_mdx_zh_hk, author, updated_at)
      VALUES ($1, 'synthetic-news', 'news', 'Original', '原稿', 'Original body', '原稿內文', 'WTIA',
      '2099-01-01T00:00:00.000Z')`, [postId]);
  }, 60_000);

  afterAll(async () => {
    try {if (pool) await pool.end();}
    finally {try {docker(["rm", "-f", container]);} catch {/* Setup may have failed. */}}
  });

  it("allows one of two stale editors, rejects the other, and audits exactly one edit", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const dependencies = mutationDependencies(pool);
    const original = new Date("2099-01-01T00:00:00.000Z");
    const edit = (titleEn: string) => updateNewsPost(staff, postId, {
      titleEn, bodyMdx: "Current body", bodyMdxZhHk: "目前內文",
    }, dependencies, original);
    const results = await Promise.allSettled([edit("Editor A"), edit("Editor B")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({message: "NEWS_EDIT_CONFLICT"});
    const {rows} = await pool.query<{title_en: string; updated_at: Date}>(
      "SELECT title_en, updated_at FROM posts WHERE id=$1", [postId]);
    expect(["Editor A", "Editor B"]).toContain(rows[0]?.title_en);
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(original.getTime());
    const audit = await pool.query("SELECT action FROM audit_events");
    expect(audit.rows).toEqual([{action: "post.updated"}]);
  }, 60_000);
});