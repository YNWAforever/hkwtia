import {describe, expect, it, vi} from "vitest";

import {contactWriterActor, createContactsRepository} from "@/lib/db/repos/contacts";

function fakeDatabase(rows: Record<string, unknown>[] = []) {
  const execute = vi.fn(async () => rows);
  return {execute, database: {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})}};
}

const interestInput = {email: "a@b.hk", locale: "en" as const, whatsappOptIn: false, whatsappNumber: null, displayName: null};

describe("contactsRepository", () => {
  it("refuses a member or anonymous actor", async () => {
    const {database} = fakeDatabase();
    const repository = createContactsRepository(async () => database as never);
    await expect(repository.upsertFromInterestForm({kind: "anonymous", userId: null}, interestInput)).rejects.toThrow("FORBIDDEN");
    await expect(repository.upsertFromInterestForm({kind: "member", userId: "u", profileId: "p"}, interestInput)).rejects.toThrow("FORBIDDEN");
  });

  it("refuses a forged contact-writer object that lacks the capability symbol", async () => {
    const {database, execute} = fakeDatabase([{id: "c-0"}]);
    const repository = createContactsRepository(async () => database as never);
    await expect(repository.upsertFromInterestForm({kind: "contact-writer", userId: null, source: "interest_form"}, interestInput)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("upserts an interest-form contact and returns the row id", async () => {
    const {database, execute} = fakeDatabase([{id: "c-1"}]);
    const repository = createContactsRepository(async () => database as never);
    const result = await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {
      email: "ADA@example.hk", locale: "zh-HK", whatsappOptIn: true, whatsappNumber: "+85291234567", displayName: "Ada",
    });
    expect(result).toEqual({id: "c-1", disposition: "upserted"});
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("records an unknown WhatsApp sender by phone", async () => {
    const {database} = fakeDatabase([{id: "c-2"}]);
    const repository = createContactsRepository(async () => database as never);
    const result = await repository.upsertFromWhatsApp(contactWriterActor("whatsapp"), {
      phoneE164: "+85291234567", locale: "en", receivedAt: new Date("2026-09-08T00:00:00Z"),
    });
    expect(result).toEqual({id: "c-2", disposition: "upserted"});
  });

  it("marks a phone opted out", async () => {
    const {database, execute} = fakeDatabase([{id: "c-2"}]);
    const repository = createContactsRepository(async () => database as never);
    await repository.markWhatsAppOptedOut(contactWriterActor("whatsapp"), "+85291234567");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
