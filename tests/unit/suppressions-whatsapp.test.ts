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

  it("refuses a member actor", async () => {
    const repository = createSuppressionsRepository(async () => ({execute: vi.fn(), transaction: vi.fn()}) as never);
    await expect(repository.optOutWhatsApp({kind: "member", userId: "u", profileId: "p"} as never, "p", "x")).rejects.toThrow();
  });
});
