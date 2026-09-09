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

  it("records the consent source the caller names, defaulting to the interest form", async () => {
    const {database, execute} = fakeDatabase([{id: "c-3"}]);
    const repository = createContactsRepository(async () => database as never);
    // drizzle's sql`` keeps interpolated primitives unwrapped in queryChunks; SQL text arrives as StringChunk objects.
    const params = () => (execute.mock.calls.at(-1) as unknown as [{queryChunks: unknown[]}])[0].queryChunks
      .filter((chunk) => typeof chunk === "string");

    await repository.upsertFromInterestForm(contactWriterActor("event_guest"), {...interestInput, whatsappOptIn: true, whatsappNumber: "+85291234567", consentSource: "rsvp"});
    expect(params()).toContain("rsvp");
    await repository.upsertFromInterestForm(contactWriterActor("interest_form"), {...interestInput, whatsappOptIn: true, whatsappNumber: "+85291234567"});
    expect(params()).toContain("interest_form");
    expect(params()).not.toContain("rsvp");
    // No opt-in, no consent source: the column must stay null whatever the caller passed.
    await repository.upsertFromInterestForm(contactWriterActor("event_guest"), {...interestInput, consentSource: "rsvp"});
    expect(params()).not.toContain("rsvp");
    await expect(repository.upsertFromInterestForm(contactWriterActor("event_guest"), {...interestInput, consentSource: "forged"})).rejects.toThrow();
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
