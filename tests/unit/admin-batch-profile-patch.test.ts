import {PgDialect} from "drizzle-orm/pg-core";
import type {SQL} from "drizzle-orm";
import {describe, expect, it} from "vitest";

import {profilePatchBatchHandler} from "@/lib/admin/batches/handlers/profile-patch";
import {batchRequestSchema} from "@/lib/admin/batches/types";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const batchId = "11111111-1111-4111-8111-111111111111";
const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: batchId, selection: {mode: "ids", profileIds: ["a", "b"]}, payload: {patch: {locale: "zh-HK"}, reason: "Staff correction"}});
const dialect = new PgDialect();
function executor(respond: (query: string) => unknown) {
  const statements: string[] = [];
  const tx = {execute: async (statement: SQL) => {const query = dialect.sqlToQuery(statement).sql; statements.push(query); return {rows: respond(query)};}};
  return {tx, statements};
}

describe("profile patch batch handler", () => {
  it("previews selected IDs from current profiles and blocks missing targets", async () => {
    const {tx} = executor((query) => /FROM "profiles"/i.test(query) ? [{id: "a", locale: "en", role: "member", updatedAt: "2026-09-27 00:00:00.123456+00"}] : []);
    const preview = await profilePatchBatchHandler.prepare(staff, request, tx);
    expect(preview).toMatchObject([{target: {id: "a"}, previewStatus: "eligible", expectedVersion: "2026-09-27 00:00:00.123456+00"}, {target: {id: "b"}, previewStatus: "blocked", reasonCode: "PROFILE_NOT_FOUND"}]);
  });

  it("uses a version-checked profile update and audit inside the item transaction", async () => {
    const {tx, statements} = executor((query) => /^UPDATE/i.test(query.trim()) ? [{id: "a"}] : /FROM "profiles"/i.test(query) ? [{id: "a", locale: "en", role: "member", updatedAt: "2026-09-27 00:00:00.123456+00", tags: [], ownerProfileId: null}] : []);
    const claim = {itemId: "22222222-2222-4222-8222-222222222222", batchId, operation: "profile_patch" as const, actorProfileId: "staff", request, target: {type: "profile" as const, id: "a"}, expectedVersion: "2026-09-27 00:00:00.123456+00", effectKey: "effect-a", attemptCount: 1, leaseOwner: "worker", leaseToken: 1};
    expect(await profilePatchBatchHandler.execute(staff, claim, tx)).toEqual({status: "succeeded", resultRef: "a"});
    expect(statements.some((query) => /UPDATE "profiles".*updated_at/i.test(query))).toBe(true);
    expect(statements.some((query) => /INSERT INTO "audit_events"/i.test(query))).toBe(true);
    const missing = executor(() => []);
    expect(await profilePatchBatchHandler.execute(staff, claim, missing.tx)).toEqual({status: "skipped", reasonCode: "VERSION_CONFLICT"});
    expect(missing.statements.some((query) => /INSERT INTO "audit_events"/i.test(query))).toBe(false);
  });
});
