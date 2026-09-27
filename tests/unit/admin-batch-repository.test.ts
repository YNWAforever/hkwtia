import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import {describe, expect, it} from "vitest";

import {createAdminBatchesRepository} from "@/lib/db/repos/admin-batches";
import {batchRequestSchema, batchPreviewDigest} from "@/lib/admin/batches/types";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const member = {kind: "member", userId: "member", profileId: "member"} as const;
const batchId = "11111111-1111-4111-8111-111111111111";
const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: batchId, selection: {mode: "ids", profileIds: ["member-a"]}, payload: {patch: {locale: "en"}, reason: "Staff correction"}});
const requestDigest = batchPreviewDigest(request);
const dialect = new PgDialect();
function fakeDb(respond: (query: string, params: unknown[]) => unknown) {
  const statements: {query: string; params: unknown[]}[] = [];
  const executor = {execute: async (statement: SQL) => {const rendered = dialect.sqlToQuery(statement); statements.push({query: rendered.sql, params: rendered.params}); return {rows: respond(rendered.sql, rendered.params)};}};
  return {database: {...executor, transaction: async <T>(run: (tx: typeof executor) => Promise<T>) => run(executor)}, statements};
}

describe("durable admin batch repository", () => {
  it("binds creation to the server actor and rejects an idempotency-key reuse with another request", async () => {
    const {database, statements} = fakeDb((query) => query.includes("INSERT INTO") ? [] : [{id: batchId, requestDigest: "different"}]);
    const repo = createAdminBatchesRepository(async () => database);
    await expect(repo.create(member as never, request, requestDigest)).rejects.toThrow("FORBIDDEN");
    expect(statements).toHaveLength(0);
    await expect(repo.create(staff, request, requestDigest)).rejects.toThrow("BATCH_IDEMPOTENCY_CONFLICT");
    expect(statements.map((entry) => entry.query).join(" ")).toContain("actor_profile_id");
    expect(statements.map((entry) => entry.params)).toContainEqual(expect.arrayContaining(["staff", requestDigest]));
  });

  it("checks preview ownership and commit digest/expiry before queueing eligible items", async () => {
    const preview = {id: batchId, actorProfileId: "staff", operation: "profile_patch", state: "ready", previewDigest: "a".repeat(64), previewExpiresAt: new Date("2030-01-01T00:00:00Z"), counters: {pending: 1, running: 0, succeeded: 0, skipped: 0, failed: 0}, validatedPayload: request.payload};
    const {database, statements} = fakeDb((query) => /FROM "admin_batch_items"/i.test(query) ? [{targetType: "profile", targetId: "member-a", previewStatus: "eligible", expectedVersion: "v1", beforeSummary: {}, afterSummary: {}, reasonCode: null, state: "failed", attemptCount: 2, errorCode: "TRANSIENT_PROVIDER", resultRef: null}] : /^UPDATE/i.test(query.trim()) ? [{id: batchId}] : [preview]);
    const repo = createAdminBatchesRepository(async () => database, () => new Date("2026-09-27T00:00:00Z"));
    await expect(repo.preview(member as never, batchId)).rejects.toThrow("FORBIDDEN");
    const result = await repo.preview(staff, batchId);
    expect(result).toMatchObject({batchId, eligible: 1, blocked: 0, counters: {failed: 0}, items: [{state: "failed", attemptCount: 2, errorCode: "TRANSIENT_PROVIDER"}]});
    await expect(repo.commit(staff, batchId, "b".repeat(64))).rejects.toThrow("BATCH_PREVIEW_MISMATCH");
    expect(statements.filter((entry) => /^UPDATE/i.test(entry.query.trim()))).toHaveLength(0);
    const summary = await repo.commit(staff, batchId, "a".repeat(64));
    expect(summary.state).toBe("queued");
    expect(statements.some((entry) => /FOR UPDATE/i.test(entry.query))).toBe(true);
  });
  it("does not report a retry queued when no transient failed item was reset", async () => {
    const batch = {id: batchId, actorProfileId: "staff", operation: "profile_patch", state: "completed_with_errors", previewDigest: "a".repeat(64), previewExpiresAt: new Date("2030-01-01T00:00:00Z"), counters: {pending: 0, running: 0, succeeded: 1, skipped: 0, failed: 1}, validatedPayload: request.payload};
    const {database} = fakeDb((query) => query.includes('RETURNING') ? [] : [batch]);
    const repo = createAdminBatchesRepository(async () => database);
    await expect(repo.retryFailed(staff, batchId)).rejects.toThrow("BATCH_NOTHING_RETRYABLE");
  });

});
