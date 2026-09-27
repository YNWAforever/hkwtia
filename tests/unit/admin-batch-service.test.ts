import {describe, expect, it, vi} from "vitest";

import {prepareBatch, getBatchPreview, commitBatch, retryFailedBatchItems, cancelPendingBatchItems, type BatchGateway} from "@/lib/admin/batches/service";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const member = {kind: "member", userId: "member", profileId: "member"} as const;
const batchId = "11111111-1111-4111-8111-111111111111";
const request = {operation: "profile_patch", idempotencyKey: batchId, selection: {mode: "ids", profileIds: ["member-a"]}, payload: {patch: {locale: "en"}, reason: "Staff correction"}} as const;
function gateway() {
  return {
    create: vi.fn(async () => ({batchId})),
    preview: vi.fn(async () => ({batchId, operation: "profile_patch", state: "ready", digest: "a".repeat(64), expiresAt: "2026-10-01T00:00:00.000Z", total: 1, eligible: 1, skipped: 0, blocked: 0, counters: {pending: 1, running: 0, succeeded: 0, skipped: 0, failed: 0}, items: []})),
    commit: vi.fn(async () => ({batchId, state: "queued", counters: {pending: 1, running: 0, succeeded: 0, skipped: 0, failed: 0}})),
    retryFailed: vi.fn(async () => ({batchId, state: "queued", counters: {pending: 1, running: 0, succeeded: 0, skipped: 0, failed: 0}})),
    cancelPending: vi.fn(async () => ({batchId, state: "cancelled", counters: {pending: 0, running: 0, succeeded: 0, skipped: 1, failed: 0}})),
  };
}

describe("admin batch actor boundary", () => {
  it("keeps new batch preparation disabled until the operations flag is explicitly enabled", async () => {
    vi.stubEnv("ADMIN_BATCH_ENABLED", "");
    try {
      const store = gateway();
      await expect(prepareBatch(staff, request, store as BatchGateway)).rejects.toThrow("BATCH_OPERATION_UNAVAILABLE");
      expect(store.create).not.toHaveBeenCalled();
    } finally {vi.unstubAllEnvs();}
  });
  it("checks the server actor, strict payload and registered operation before creating a durable batch", async () => {
    const store = gateway();
    await expect(prepareBatch(member, request, store as BatchGateway, new Set(["profile_patch"]))).rejects.toThrow("FORBIDDEN");
    await expect(prepareBatch(staff, {...request, actor: "superadmin"}, store as BatchGateway, new Set(["profile_patch"]))).rejects.toThrow();
    await expect(prepareBatch(staff, request, store as BatchGateway, new Set())).rejects.toThrow("BATCH_OPERATION_UNAVAILABLE");
    expect(store.create).not.toHaveBeenCalled();
    expect(await prepareBatch(staff, request, store as BatchGateway, new Set(["profile_patch"]))).toEqual({batchId});
    expect(store.create).toHaveBeenCalledWith(staff, expect.objectContaining({operation: "profile_patch"}), expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it("checks ownership inputs and delegates preview, commit, retry and cancel without accepting a forged actor", async () => {
    const store = gateway();
    await expect(getBatchPreview(member, batchId, store as BatchGateway)).rejects.toThrow("FORBIDDEN");
    await expect(commitBatch(staff, {batchId, previewDigest: "tampered", actor: "superadmin"}, store as BatchGateway)).rejects.toThrow();
    expect(store.commit).not.toHaveBeenCalled();
    expect((await getBatchPreview(staff, batchId, store as BatchGateway)).state).toBe("ready");
    expect((await commitBatch(staff, {batchId, previewDigest: "a".repeat(64)}, store as BatchGateway)).state).toBe("queued");
    expect(store.commit).toHaveBeenCalledWith(staff, batchId, "a".repeat(64));
    expect((await retryFailedBatchItems(staff, batchId, store as BatchGateway)).state).toBe("queued");
    expect((await cancelPendingBatchItems(staff, batchId, store as BatchGateway)).state).toBe("cancelled");
  });
});
