import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import {beforeEach, afterEach, describe, expect, it, vi} from "vitest";

import {createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";
import {batchRequestSchema} from "@/lib/admin/batches/types";

const batchId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: batchId, selection: {mode: "ids", profileIds: ["member-a"]}, payload: {patch: {locale: "en"}, reason: "Staff correction"}});
const dialect = new PgDialect();
function fakeDb(respond: (query: string) => unknown) {
  const statements: string[] = [];
  const isolationLevels: unknown[] = [];
  const executor = {execute: async (statement: SQL) => {const query = dialect.sqlToQuery(statement).sql; statements.push(query); return {rows: respond(query)};}};
  return {database: {...executor, transaction: async <T>(run: (tx: typeof executor) => Promise<T>, config?: {isolationLevel: string}) => {isolationLevels.push(config?.isolationLevel); return run(executor);}}, statements, isolationLevels};
}

describe("admin batch item leases", () => {
  beforeEach(() => vi.stubEnv("ADMIN_BATCH_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());
  it("materializes one fixed preview in a repeatable-read worker transaction", async () => {
    const {database, statements, isolationLevels} = fakeDb((query) => {
      if (/FOR UPDATE SKIP LOCKED/i.test(query)) return [{id: batchId, actorProfileId: "staff", operation: "profile_patch", selectionSnapshot: request, requestDigest: "digest"}];
      if (/FROM "profiles"/i.test(query)) return [{role: "staff"}];
      if (/^UPDATE/i.test(query.trim())) return [{id: batchId}];
      return [];
    });
    const repo = createAdminBatchWorkerRepository(async () => database);
    const handler = {prepare: vi.fn(async () => [{target: {type: "profile" as const, id: "member-a"}, previewStatus: "eligible" as const, eligible: true, reasonCode: null, expectedVersion: "v1", before: {locale: "zh-HK"}, after: {locale: "en"}}]), execute: vi.fn(async () => ({status: "succeeded" as const, resultRef: null}))};
    expect(await repo.prepareNext({profile_patch: handler}, new Date("2026-09-27T00:00:00Z"))).toBe(true);
    expect(isolationLevels).toContain("repeatable read");
    expect(handler.prepare).toHaveBeenCalledWith({kind: "staff", userId: "staff", profileId: "staff"}, request, expect.any(Object));
    expect(statements.some((query) => /INSERT INTO "admin_batch_items"/i.test(query))).toBe(true);
    expect(statements.some((query) => /preview_digest/i.test(query) && /^UPDATE/i.test(query.trim()))).toBe(true);
  });

  it("claims only due items with SKIP LOCKED and a monotonic fencing token", async () => {
    const {database, statements} = fakeDb((query) => /lease_token.*\+ 1/i.test(query) ? [{itemId, batchId, operation: "profile_patch", actorProfileId: "staff", selectionSnapshot: request, targetType: "profile", targetId: "member-a", expectedVersion: "v1", effectKey: "effect-a", attemptCount: 2, leaseOwner: "worker-a", leaseToken: 7}] : []);
    const repo = createAdminBatchWorkerRepository(async () => database);
    const claims = await repo.claimItems("worker-a", new Date("2026-09-27T00:00:00Z"), 50);
    expect(claims).toMatchObject([{itemId, attemptCount: 2, leaseToken: 7, request}]);
    const claimStatement = statements.find((query) => /lease_token.*\+ 1/i.test(query));
    expect(claimStatement).toBeDefined();
    expect(claimStatement).toMatch(/FOR UPDATE OF i SKIP LOCKED/i);
    expect(claimStatement).toMatch(/attempt_count.*\+ 1/i);
  });

  it("refuses an expired or superseded claim before any handler effect", async () => {
    const {database} = fakeDb(() => []);
    const repo = createAdminBatchWorkerRepository(async () => database);
    const handler = {prepare: vi.fn(async () => []), execute: vi.fn(async () => ({status: "succeeded" as const, resultRef: null}))};
    const outcome = await repo.executeClaim({itemId, batchId, operation: "profile_patch", actorProfileId: "staff", request, target: {type: "profile", id: "member-a"}, expectedVersion: "v1", effectKey: "effect-a", attemptCount: 2, leaseOwner: "worker-a", leaseToken: 7}, handler, new Date("2026-09-27T00:00:00Z"));
    expect(outcome).toBe("stale");
    expect(handler.execute).not.toHaveBeenCalled();
  });
});
