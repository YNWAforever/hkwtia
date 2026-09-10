import {describe, expect, it, vi} from "vitest";

import {createSuppressionsRepository, unsubscribeActor} from "@/lib/db/repos/suppressions";

describe("suppressionsRepository.optOutWhatsApp", () => {
  it("clears the profile flag, inserts the whatsapp suppression and an audit row in one transaction", async () => {
    const execute = vi.fn(async () => [{id: "row"}]);
    const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
    const repository = createSuppressionsRepository(async () => database as never);
    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "whatsapp_stop")).resolves.toBe("created");
    expect(execute).toHaveBeenCalledTimes(3);
  });

  /**
   * C-1 review fix. `recordOptOut` runs this leg and the contact leg in two
   * transactions and the webhook route 500s on a throw, so a failure in the
   * second one has Woztell redeliver the same STOP. The suppression INSERT is
   * the idempotency key: when it conflicts, the withdrawal is already recorded
   * and a second `consent.whatsapp.revoked` row for it would be a fiction.
   */
  it("writes no second audit row when the suppression already exists", async () => {
    const responses: Record<string, unknown>[][] = [[{id: "profile-1"}], [], [{id: "audit"}]];
    const execute = vi.fn(async () => responses.shift() ?? []);
    const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
    const repository = createSuppressionsRepository(async () => database as never);
    await expect(repository.optOutWhatsApp(unsubscribeActor(), "profile-1", "whatsapp_stop")).resolves.toBe("existing");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("refuses a member actor", async () => {
    const repository = createSuppressionsRepository(async () => ({execute: vi.fn(), transaction: vi.fn()}) as never);
    await expect(repository.optOutWhatsApp({kind: "member", userId: "u", profileId: "p"} as never, "p", "x")).rejects.toThrow();
  });
});
