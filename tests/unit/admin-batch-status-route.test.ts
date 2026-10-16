import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  actor: vi.fn(async () => ({kind: "staff", userId: "staff", profileId: "staff"})),
  status: vi.fn(async () => ({batchId: "11111111-1111-4111-8111-111111111111", state: "running", counters: {pending: 8, running: 0, succeeded: 2, skipped: 0, failed: 0}}))
}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: state.actor}));
vi.mock("@/lib/db/repos/admin-batches", () => ({adminBatchesRepository: {status: state.status}}));

import {GET} from "@/app/api/admin/batches/[id]/status/route";

const batchId = "11111111-1111-4111-8111-111111111111";
const request = (id = batchId) => GET(new Request(`https://example.test/api/admin/batches/${id}/status`), {params: Promise.resolve({id})});

describe("batch status API", () => {
  beforeEach(() => {state.actor.mockReset(); state.status.mockReset(); state.actor.mockResolvedValue({kind: "staff", userId: "staff", profileId: "staff"}); state.status.mockResolvedValue({batchId, state: "running", counters: {pending: 8, running: 0, succeeded: 2, skipped: 0, failed: 0}});});
  it("returns only owner-scoped state and counters without caching", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({batchId, state: "running", counters: {pending: 8, running: 0, succeeded: 2, skipped: 0, failed: 0}});
    expect(state.status).toHaveBeenCalledWith({kind: "staff", userId: "staff", profileId: "staff"}, batchId);
  });
  it("hides unauthorized, non-owner and invalid IDs as 404", async () => {
    state.actor.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await request()).status).toBe(404);
    expect(state.status).not.toHaveBeenCalled();
    state.status.mockRejectedValueOnce(new Error("BATCH_NOT_FOUND"));
    expect((await request()).status).toBe(404);
    expect((await request("invalid")).status).toBe(404);
  });
});