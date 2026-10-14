import {describe, expect, it, vi} from "vitest";
import type {Actor} from "@/lib/membership/lifecycle";
const getDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/repos/common", async (original) => ({...await original<typeof import("@/lib/db/repos/common")>(), getDb}));
import {seatInviteBatchesRepository, listRecentSeatInviteBatches} from "@/lib/db/repos/seat-invite-batches";
describe("seat batch repository authority", () => {
  it.each([{kind: "anonymous", userId: null}, {kind: "staff", userId: "staff", profileId: "staff"}] as const)("rejects $kind on every batch repository operation before database work", async (actor) => {
    const operations = Object.values(seatInviteBatchesRepository);
    expect(operations.length).toBeGreaterThanOrEqual(8);
    for (const operation of operations) {
      // Deliberately malformed public input must never take priority over the actor gate.
      await expect((operation as (actor: Actor, input: never) => Promise<unknown>)(actor, {} as never)).rejects.toThrow("FORBIDDEN");
    }
    await expect(listRecentSeatInviteBatches(actor, "invalid")).rejects.toThrow("FORBIDDEN");
    expect(getDb).not.toHaveBeenCalled();
  });
});
