import {describe, expect, it, vi} from "vitest";

import {runAdminBatchJob} from "@/lib/jobs/admin-batch-runner";
import type {BatchClaim, BatchOperationHandler, BatchWorkerRepository} from "@/lib/admin/batches/worker-types";
import {batchRequestSchema} from "@/lib/admin/batches/types";

const request = batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: "11111111-1111-4111-8111-111111111111", selection: {mode: "ids", profileIds: ["member-a"]}, payload: {patch: {locale: "en"}, reason: "Staff correction"}});
const claim = (itemId: string): BatchClaim => ({itemId, batchId: request.idempotencyKey, operation: "profile_patch" as const, actorProfileId: "staff", request, target: {type: "profile" as const, id: itemId}, expectedVersion: "v1", effectKey: `effect:${itemId}`, attemptCount: 1, leaseOwner: "worker", leaseToken: 1});

describe("admin batch worker runner", () => {
  it("prepares once, claims bounded items and continues after an item handler error", async () => {
    const calls: string[] = [];
    const repo = {
      prepareNext: vi.fn(async () => {calls.push("prepare"); return true;}),
      claimItems: vi.fn(async () => {calls.push("claim"); return [claim("member-a"), claim("member-b")];}),
      executeClaim: vi.fn(async (item, handler) => {calls.push(`execute:${item.itemId}`); await handler.execute({kind: "staff", userId: "staff", profileId: "staff"}, item, {} as never); return "settled" as const;}),
    } as BatchWorkerRepository;
    const handler = {prepare: vi.fn(async () => []), execute: vi.fn(async (_actor, item) => {if (item.itemId === "member-a") throw new Error("transient"); return {status: "succeeded", resultRef: "done"} as const;})} as BatchOperationHandler;
    const result = await runAdminBatchJob(new Date("2026-09-27T00:00:00Z"), {repository: repo, handlers: {profile_patch: handler}, workerId: "worker"});
    expect(calls).toEqual(["prepare", "claim", "execute:member-a", "execute:member-b"]);
    expect(result).toMatchObject({claimed: 2, settled: 1, failed: 1});
    expect(repo.claimItems).toHaveBeenCalledWith("worker", expect.any(Date), 50);
  });
});
