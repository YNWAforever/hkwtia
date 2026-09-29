import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

import {Pool, type PoolClient} from "pg";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {updateEvent, type EventMutationDependencies} from "@/lib/db/repos/events";
import {legacyDerivedEventColumns} from "@/tests/fixtures/event-row";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const container = "hkwtia-event-edit-" + process.pid;
const eventId = randomUUID();
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const original = new Date("2026-09-01T00:00:00.000Z");
const base = {
  id: eventId, slug: "synthetic-event", titleEn: "Synthetic event", titleZh: "合成活動",
  descriptionEn: "Original", descriptionZh: "原稿",
  startsAt: new Date("2099-09-01T10:00:00.000Z"), endsAt: new Date("2099-09-01T12:00:00.000Z"),
  venue: "Test venue", capacity: 20, memberOnly: false, published: false,
  heroMediaId: null, createdAt: original, updatedAt: original,
};
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

async function transaction<T>(database: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {client.release();}
}

function dependencies(database: Pool): EventMutationDependencies {
  return {transaction: (work) => transaction(database, async (client) => work({
    insertEvent: async () => {throw new Error("not used");},
    lockEvent: async (id) => {
      const {rows} = await client.query<{description_en: string; updated_at: Date}>(
        "SELECT description_en, updated_at FROM cms_event WHERE id=$1 FOR UPDATE", [id]);
      if (!rows[0]) return null;
      const current = {...base, ...legacyDerivedEventColumns(base),
        descriptionEn: rows[0].description_en, updatedAt: rows[0].updated_at};
      return current as never;
    },
    updateEvent: async (id, input, updatedAt) => {
      const {rows} = await client.query<{description_en: string; updated_at: Date}>(
        "UPDATE cms_event SET description_en=$2, updated_at=$3 WHERE id=$1 RETURNING description_en, updated_at",
        [id, input.descriptionEn, updatedAt]);
      return rows[0] ? {...base, ...legacyDerivedEventColumns(base), ...input,
        descriptionEn: rows[0].description_en, updatedAt: rows[0].updated_at} as never : null;
    },
    lockActiveMedia: async () => null,
    insertAudit: async (input) => {await client.query(
      "INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)",
      [input.actorUserId, input.actorType, input.action, input.targetType, input.targetId, input.metadata]);},
  }))};
}

describe.skipIf(!enabled)("event edit version on disposable PostgreSQL", () => {
  beforeAll(async () => {
    docker(["run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=test", "-p", "127.0.0.1::5432", "postgres:16-alpine"]);
    await waitForPostgres();
    const binding = docker(["port", container, "5432/tcp"]).trim();
    const port = binding.slice(binding.lastIndexOf(":") + 1);
    if (!/^\d+$/.test(port)) throw new Error("disposable PostgreSQL port unavailable");
    pool = new Pool({connectionString: "postgresql://postgres:test@127.0.0.1:" + port + "/postgres?sslmode=disable"});
    await pool.query("CREATE TABLE cms_event (id uuid PRIMARY KEY, description_en text NOT NULL, updated_at timestamptz NOT NULL)");
    await pool.query(`CREATE TABLE audit_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_type text,
      action text, target_type text, target_id text, metadata jsonb
    )`);
    await pool.query("INSERT INTO cms_event (id, description_en, updated_at) VALUES ($1,'Original',$2)", [eventId, original]);
  }, 60_000);

  afterAll(async () => {
    try {if (pool) await pool.end();}
    finally {try {docker(["rm", "-f", container]);} catch {/* Setup may have failed. */}}
  });

  it("accepts one of two stale editors and audits exactly the accepted write", async () => {
    if (!pool) throw new Error("disposable PostgreSQL pool is unavailable");
    const mutation = dependencies(pool);
    const edit = (descriptionEn: string) => updateEvent(staff, eventId, {descriptionEn}, mutation, original);
    const results = await Promise.allSettled([edit("Editor A"), edit("Editor B")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({message: "EVENT_EDIT_CONFLICT"});
    const {rows} = await pool.query<{description_en: string; updated_at: Date}>(
      "SELECT description_en, updated_at FROM cms_event WHERE id=$1", [eventId]);
    expect(["Editor A", "Editor B"]).toContain(rows[0]?.description_en);
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(original.getTime());
    const audit = await pool.query("SELECT action FROM audit_events");
    expect(audit.rows).toEqual([{action: "event.updated"}]);
    const accepted = results.find((result) => result.status === "fulfilled");
    if (accepted?.status !== "fulfilled" || !accepted.value) throw new Error("accepted write missing");
    const followUp = await updateEvent(staff, eventId, {descriptionEn: "Follow-up"}, mutation, accepted.value.updatedAt);
    expect(followUp?.descriptionEn).toBe("Follow-up");
    expect(followUp?.updatedAt.getTime()).toBeGreaterThan(accepted.value.updatedAt.getTime());
  }, 60_000);
});