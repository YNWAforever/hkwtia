import {describe, expect, it, vi} from "vitest";

import {contactWriterActor} from "@/lib/db/repos/contacts";
import {createEventGuestsRepository} from "@/lib/db/repos/event-guests";

const EVENT = "22222222-2222-4222-8222-222222222222";
const lockedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: EVENT, slug: "ai-clinic", title_en: "AI Clinic", title_zh: "AI 診所", status: "published", visibility: "public", registration_mode: "rsvp",
  capacity: 1, starts_at: "2030-01-01T00:00:00Z", ends_at: null, ...overrides,
});
const input = (overrides: Record<string, unknown> = {}) => ({
  eventId: EVENT, name: "A", email: "a@b.hk", locale: "en", whatsappNumber: null, organisation: null, marketingConsent: false,
  idempotencyKey: "k".repeat(8), cancelTokenDigest: "d".repeat(64), ...overrides,
});

/** Flattens a drizzle sql`` template to its text plus interpolated primitives, as billing-checkout-locking.test.ts does. */
function sqlText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if ("value" in value && Array.isArray((value as {value?: unknown}).value)) return ((value as {value: unknown[]}).value).join("");
  if ("queryChunks" in value && Array.isArray((value as {queryChunks?: unknown}).queryChunks)) return (value as {queryChunks: unknown[]}).queryChunks.map(sqlText).join(" ");
  return "";
}

function database(rows: Record<string, unknown>[][]) {
  const queue = [...rows];
  const execute = vi.fn(async () => queue.shift() ?? []);
  return {execute, db: {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})}};
}

describe("eventGuestsRepository (programme B-4)", () => {
  it("refuses any actor without the event_guest capability", async () => {
    const {execute, db} = database([]);
    const repository = createEventGuestsRepository(async () => db as never);
    await expect(repository.register({kind: "anonymous", userId: null}, input())).rejects.toThrow("FORBIDDEN");
    // A different contact-writer source holds the symbol but not this capability.
    await expect(repository.register(contactWriterActor("interest_form"), input())).rejects.toThrow("FORBIDDEN");
    await expect(repository.register({kind: "contact-writer", userId: null, source: "event_guest"}, input())).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("registers inside capacity and waitlists beyond it, writing an audit row in the same transaction", async () => {
    // lock -> capacity -> existing-row probe (none) -> upsert -> audit row
    const {execute, db} = database([[lockedEvent()], [{count: 0}], [], [{id: "g1", status: "registered"}], []]);
    const repository = createEventGuestsRepository(async () => db as never, () => new Date("2026-09-09T00:00:00Z"));
    const result = await repository.register(contactWriterActor("event_guest"), input({email: "A@B.hk", idempotencyKey: "k1k1k1k1"}));
    expect(result).toEqual({id: "g1", disposition: "registered", status: "registered", cancelTokenDigest: "d".repeat(64), eventTitle: "AI Clinic", slug: "ai-clinic"});
    expect(execute).toHaveBeenCalledTimes(5);
    expect(sqlText((execute.mock.calls[4] as unknown[])[0])).toContain("event.guest.registered");

    const full = database([[lockedEvent()], [{count: 1}], [], [{id: "g2", status: "waitlist"}], []]);
    await expect(createEventGuestsRepository(async () => full.db as never, () => new Date("2026-09-09T00:00:00Z")).register(contactWriterActor("event_guest"), input({name: "B", email: "b@b.hk", idempotencyKey: "k2k2k2k2", cancelTokenDigest: "e".repeat(64), locale: "zh-HK"})))
      .resolves.toEqual(expect.objectContaining({id: "g2", disposition: "waitlist", eventTitle: "AI 診所", slug: "ai-clinic"}));
  });

  it("reports an active existing row as already registered without writing", async () => {
    const {execute, db} = database([[lockedEvent()], [{count: 1}], [{id: "g1", status: "registered", cancel_token_digest: "d".repeat(64)}]]);
    await expect(createEventGuestsRepository(async () => db as never, () => new Date("2026-09-09T00:00:00Z")).register(contactWriterActor("event_guest"), input({idempotencyKey: "k1k1k1k1"})))
      .resolves.toEqual({id: "g1", disposition: "already_registered", status: "registered", cancelTokenDigest: "d".repeat(64), eventTitle: "AI Clinic", slug: "ai-clinic"});
    // lock, capacity, probe: no INSERT and no audit row.
    expect(execute).toHaveBeenCalledTimes(3);
    const probe = sqlText((execute.mock.calls[2] as unknown[])[0]);
    expect(probe).toContain("FOR UPDATE");
    expect(probe).not.toContain("INSERT");
  });

  it("revives a cancelled row as a fresh registration carrying the new cancel digest", async () => {
    const {execute, db} = database([[lockedEvent()], [{count: 0}], [{id: "g1", status: "cancelled"}], [{id: "g1", status: "registered"}], []]);
    await expect(createEventGuestsRepository(async () => db as never, () => new Date("2026-09-09T00:00:00Z")).register(contactWriterActor("event_guest"), input({cancelTokenDigest: "e".repeat(64)})))
      .resolves.toEqual(expect.objectContaining({id: "g1", disposition: "registered"}));
    expect(execute).toHaveBeenCalledTimes(5);
    const upsert = sqlText((execute.mock.calls[3] as unknown[])[0]);
    expect(upsert).toContain("INSERT INTO");
    expect(upsert).toContain("cancel_token_digest = EXCLUDED.cancel_token_digest");
    expect(upsert).toContain("e".repeat(64));
  });

  it("refuses a forged RSVP to the exact audited demo event", async () => {
    const {db, execute} = database([[lockedEvent({slug: "wtia-global-growth-demo-briefing-2026"})]]);
    await expect(createEventGuestsRepository(async () => db as never).register(contactWriterActor("event_guest"), input())).rejects.toThrow("EVENT_NOT_FOUND");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses closed, unpublished or external-registration events before writing", async () => {
    const now = () => new Date("2026-09-09T00:00:00Z");
    const external = database([[lockedEvent({registration_mode: "external", capacity: null})]]);
    await expect(createEventGuestsRepository(async () => external.db as never, now).register(contactWriterActor("event_guest"), input({idempotencyKey: "k3k3k3k3", cancelTokenDigest: "f".repeat(64)}))).rejects.toThrow("EVENT_REGISTRATION_EXTERNAL");
    expect(external.execute).toHaveBeenCalledTimes(1);

    const draft = database([[lockedEvent({status: "pending_review"})]]);
    await expect(createEventGuestsRepository(async () => draft.db as never, now).register(contactWriterActor("event_guest"), input())).rejects.toThrow("EVENT_NOT_FOUND");
    expect(draft.execute).toHaveBeenCalledTimes(1);

    const closed = database([[lockedEvent({starts_at: "2020-01-01T00:00:00Z", ends_at: "2020-01-01T02:00:00Z"})]]);
    await expect(createEventGuestsRepository(async () => closed.db as never, now).register(contactWriterActor("event_guest"), input())).rejects.toThrow("EVENT_REGISTRATION_CLOSED");
    expect(closed.execute).toHaveBeenCalledTimes(1);
  });

  it("checks in a confirmed guest once and audits the registration ID", async () => {
    const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
    const registrationId = "33333333-3333-4333-8333-333333333333";
    const input = {eventId: EVENT, registrationId};
    const first = database([[{status: "published"}], [{status: "registered", checked_in_at: null}], [], []]);
    await expect(createEventGuestsRepository(async () => first.db as never).checkInGuest(staff, input)).resolves.toBe("checked_in");
    expect(first.execute).toHaveBeenCalledTimes(4);
    expect(sqlText((first.execute.mock.calls[2] as unknown[])[0])).toContain("checked_in_at");
    expect(sqlText((first.execute.mock.calls[3] as unknown[])[0])).toContain("event.guest.checked_in");
    expect(sqlText((first.execute.mock.calls[3] as unknown[])[0])).toContain(registrationId);
    const repeat = database([[{status: "published"}], [{status: "attended", checked_in_at: new Date()}]]);
    await expect(createEventGuestsRepository(async () => repeat.db as never).checkInGuest(staff, input)).resolves.toBe("already_checked_in");
    expect(repeat.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects cancelled events, waitlisted guests, other-event IDs and nonstaff actors without writes", async () => {
    const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
    const input = {eventId: EVENT, registrationId: "33333333-3333-4333-8333-333333333333"};
    for (const rows of [
      [[{status: "cancelled"}]],
      [[{status: "published"}], [{status: "waitlist", checked_in_at: null}]],
      [[{status: "published"}], []],
    ]) {
      const {db, execute} = database(rows);
      await expect(createEventGuestsRepository(async () => db as never).checkInGuest(staff, input)).resolves.toBe("ineligible");
      expect(execute.mock.calls.length).toBeLessThanOrEqual(2);
    }
    const noAccess = database([]);
    await expect(createEventGuestsRepository(async () => noAccess.db as never).checkInGuest({kind: "anonymous", userId: null}, input)).rejects.toThrow("FORBIDDEN");
    expect(noAccess.execute).not.toHaveBeenCalled();
  });

  it("cancels by token digest and reports unknown tokens", async () => {
    const {db, execute} = database([[{id: "g1", event_id: EVENT}], []]);
    await expect(createEventGuestsRepository(async () => db as never).cancelByToken(contactWriterActor("event_guest"), "d".repeat(64))).resolves.toBe("cancelled");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(sqlText((execute.mock.calls[1] as unknown[])[0])).toContain("event.guest.cancelled");
    const miss = database([[]]);
    await expect(createEventGuestsRepository(async () => miss.db as never).cancelByToken(contactWriterActor("event_guest"), "d".repeat(64))).resolves.toBe("unknown");
    await expect(createEventGuestsRepository(async () => miss.db as never).cancelByToken(contactWriterActor("event_guest"), "not-a-digest")).rejects.toThrow();
    await expect(createEventGuestsRepository(async () => miss.db as never).cancelByToken({kind: "anonymous", userId: null}, "d".repeat(64))).rejects.toThrow("FORBIDDEN");
  });
});
