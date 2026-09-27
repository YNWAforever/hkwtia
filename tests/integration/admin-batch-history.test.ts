import {randomUUID} from "node:crypto";

import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {createAdminBatchHistoryRepository} from "@/lib/db/repos/admin-batch-history";
import {createAdminBatchesRepository} from "@/lib/db/repos/admin-batches";
import type {AdminActor} from "@/lib/membership/lifecycle";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const root = {kind: "superadmin", userId: "root", profileId: "root"} as const;
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;
const ids: string[] = [];

async function insertBatch(actor: "staff" | "root", operation: "profile_patch" | "export_members", state: "ready" | "completed_with_errors", when: string, counters: Record<string, number>) {
  const id = randomUUID();
  await fixture.pool.query(`INSERT INTO admin_batches (id, actor_profile_id, operation, validated_payload, selection_snapshot, idempotency_key, request_digest, state, counters, created_at)
    VALUES ($1, $2, $3, '{}'::jsonb, '{}'::jsonb, $4, $5, $6, $7::jsonb, $8::timestamptz)`, [id, actor, operation, randomUUID(), "test-digest", state, JSON.stringify(counters), when]);
  return id;
}

describe.skipIf(!enabled)("admin batch history on disposable PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase();
    for (let i = 0; i < 27; i += 1) {
      ids.push(await insertBatch("staff", i % 2 ? "export_members" : "profile_patch", i === 0 ? "completed_with_errors" : "ready", "2026-09-27T12:00:00Z", i === 0 ? {succeeded: 8, failed: 2} : {pending: 3}));
    }
    await insertBatch("root", "profile_patch", "ready", "2026-09-28T12:00:00Z", {pending: 1});
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});

  it("returns only batches the actor can open, including a resumable preview and partial progress", async () => {
    const history = createAdminBatchHistoryRepository(async () => fixture.database);
    const page = await history.list(staff);
    expect(page.items).toHaveLength(25);
    expect((await history.recent(staff)).map(item => item.id)).toEqual(page.items.slice(0, 3).map(item => item.id));
    expect(page.items.every(item => ids.includes(item.id) && item.actorLabel === "Staff")).toBe(true);
    expect(page.items.find(item => item.state === "completed_with_errors")).toMatchObject({total: 10, succeeded: 8, failed: 2});
    const detail = createAdminBatchesRepository(async () => fixture.database);
    await expect(detail.preview(root, page.items[0]!.id)).rejects.toThrow("BATCH_NOT_FOUND");
    expect((await detail.preview(staff, page.items[0]!.id)).state).toBe("ready");
    const rootPage = await history.list(root);
    expect(rootPage.items).toHaveLength(1);
    expect(rootPage.items[0]?.actorLabel).toBe("Root");
    await expect(history.list({kind: "member", userId: "a", profileId: "a"} as unknown as AdminActor)).rejects.toThrow("FORBIDDEN");
  });

  it("uses a stable tied-time cursor and binds cursors to filters", async () => {
    const history = createAdminBatchHistoryRepository(async () => fixture.database);
    const first = await history.list(staff);
    expect(first.nextCursor).toBeTruthy();
    const second = await history.list(staff, {cursor: first.nextCursor!});
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(27);
    const filtered = await history.list(staff, {state: "completed_with_errors", operation: "profile_patch"});
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({state: "completed_with_errors", operation: "profile_patch"});
    await expect(history.list(staff, {cursor: first.nextCursor!, operation: "export_members"})).rejects.toThrow("INVALID_BATCH_HISTORY_CURSOR");
  });

  it("does not claim a failure whose code only resembles the transient prefix", async () => {
    const id = await insertBatch("staff", "profile_patch", "completed_with_errors", "2026-09-26T12:00:00Z", {failed: 1});
    await fixture.pool.query(`INSERT INTO admin_batch_items (batch_id, target_type, target_id, expected_version, preview_status, state, attempt_count, effect_key, error_code)
      VALUES ($1, 'profile', 'synthetic-bad-prefix', 'version', 'eligible', 'failed', 1, $2, 'TRANSIENTX')`, [id, randomUUID()]);
    const detail = createAdminBatchesRepository(async () => fixture.database);
    await expect(detail.retryFailed(staff, id)).rejects.toThrow("BATCH_NOTHING_RETRYABLE");
  });
});
