import {describe, expect, it, vi} from "vitest";
import {parseSeatInviteRows, previewSeatInvites, commitSeatInvites, runSeatInviteBatch} from "@/lib/portal/seat-bulk-core";
import type {SeatBatchStore, SeatBatchView} from "@/lib/portal/seat-bulk-contract";
const actor = {kind: "member", userId: "auth", profileId: "manager"} as const;
const companyId = "11111111-1111-4111-8111-111111111111", batchId = "22222222-2222-4222-8222-222222222222", itemId = "33333333-3333-4333-8333-333333333333";
const view: SeatBatchView = {batchId, companyId, state: "committed", available: 4, canCommit: true, expiresAt: "2099-01-01T00:00:00.000Z", items: []};
function store(): SeatBatchStore {
  return {preview: vi.fn(async () => view), commit: vi.fn(async () => view), read: vi.fn(async () => view), retry: vi.fn(async () => view), cancel: vi.fn(async () => view),
    prepareNext: vi.fn(async () => false), claimDelivery: vi.fn(async () => null), settleDelivery: vi.fn(async () => undefined)};
}
describe("manager-scoped seat invitation batches", () => {
  it("parses pasted rows, defaults to member, preserves explicit roles and marks duplicates/errors", () => {
    expect(parseSeatInviteRows(" Alice@example.test \nbob@example.test,admin\nALICE@example.test,owner\nbad,owner\ncarol@example.test,superadmin")).toEqual([
      {position: 1, email: "alice@example.test", role: "member", issue: null}, {position: 2, email: "bob@example.test", role: "admin", issue: null},
      {position: 3, email: "alice@example.test", role: "owner", issue: "DUPLICATE"}, {position: 4, email: "bad", role: "owner", issue: "INVALID_EMAIL"},
      {position: 5, email: "carol@example.test", role: "member", issue: "INVALID_ROLE"},
    ]);
    expect(() => parseSeatInviteRows(Array(51).fill("a@example.test").join("\n"))).toThrow("BATCH_TOO_LARGE");
    expect(() => parseSeatInviteRows("\n")).toThrow("INVALID_INPUT");
  });
  it("creates a server snapshot and commits only its selected IDs with a stable request ID", async () => {
    const db = store();
    await previewSeatInvites(actor, {companyId, rows: "a@example.test", locale: "zh-HK"}, db);
    expect(db.preview).toHaveBeenCalledWith(actor, {companyId, locale: "zh-HK", rows: [{position: 1, email: "a@example.test", role: "member", issue: null}]});
    const input = {companyId, snapshotId: batchId, requestId: itemId, selectedItemIds: [itemId], confirmElevated: false};
    await commitSeatInvites(actor, input, db);
    expect(db.commit).toHaveBeenCalledWith(actor, input);
    await expect(commitSeatInvites(actor, {...input, rows: "tampered@example.test"}, db)).rejects.toThrow();
  });
  it("rejects nonmembers before preview/commit/provider work", async () => {
    const db = store();
    for (const other of [{kind: "anonymous", userId: null}, {kind: "staff", userId: "staff", profileId: "staff"}] as const) {
      await expect(previewSeatInvites(other, {}, db)).rejects.toThrow("FORBIDDEN");
      await expect(commitSeatInvites(other, {}, db)).rejects.toThrow("FORBIDDEN");
    }
    expect(db.preview).not.toHaveBeenCalled(); expect(db.commit).not.toHaveBeenCalled();
  });
  it("does not re-send a claimed/uncertain result; settles only the existing operation key", async () => {
    const db = store();
    const claim = {itemId, claimId: batchId, email: "a@example.test", token: "private", locale: "en" as const};
    vi.mocked(db.claimDelivery).mockResolvedValueOnce(claim).mockResolvedValue(null);
    const deliver = vi.fn(async () => {throw new Error("timeout after acceptance");});
    await runSeatInviteBatch(actor, {companyId, batchId}, {store: db, deliver});
    await runSeatInviteBatch(actor, {companyId, batchId}, {store: db, deliver});
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(db.settleDelivery).toHaveBeenCalledWith(actor, {companyId, batchId, itemId, claimId: batchId, outcome: "uncertain"});
  });
  it("never marks accepted success if durable result recording fails", async () => {
    const db = store();
    vi.mocked(db.claimDelivery).mockResolvedValueOnce({itemId, claimId: batchId, email: "a@example.test", token: "private", locale: "en"});
    vi.mocked(db.settleDelivery).mockRejectedValueOnce(new Error("DB_FAILED"));
    const deliver = vi.fn(async () => undefined);
    await expect(runSeatInviteBatch(actor, {companyId, batchId}, {store: db, deliver})).rejects.toThrow("DB_FAILED");
    expect(db.settleDelivery).toHaveBeenCalledTimes(1);
    expect(db.read).not.toHaveBeenCalled();
  });
});
