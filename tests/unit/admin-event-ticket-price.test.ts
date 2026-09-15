import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {parseTicketPrice} from "@/lib/admin/event-form-input";
import {createEvent, saveMemberEventDraft, updateEvent, type EventMutationDependencies, type MemberEventDependencies} from "@/lib/db/repos/events";
import {legacyDerivedEventColumns} from "@/tests/fixtures/event-row";
import type {Actor} from "@/lib/membership/lifecycle";

describe("parseTicketPrice", () => {
  it("reads a whole-dollar HKD price as cents", () => {
    expect(parseTicketPrice({mode: "ticketed", price: "250"})).toBe(25_000);
  });

  it("refuses a ticketed event with no price or a zero price", () => {
    expect(() => parseTicketPrice({mode: "ticketed", price: ""})).toThrow(z.ZodError);
    expect(() => parseTicketPrice({mode: "ticketed", price: "0"})).toThrow(z.ZodError);
  });

  it("ignores a price on a non-ticketed event", () => {
    expect(parseTicketPrice({mode: "rsvp", price: "250"})).toBeNull();
  });
});

// The second layer: a member may never price anything, and staff may price only a
// ticketed event. `parseTicketPrice` nulls a stray price on the way in, so these
// drive `createEvent` directly to prove the repository refuses even if a caller
// reaches it without the admin form.
describe("the event write boundary prices only ticketed events", () => {
  const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
  const base = {slug: "ai-clinic", titleEn: "AI clinic", descriptionEn: "Hands on", startsAt: "2099-09-01T10:00:00.000Z"};
  // A full row, derived the way the fixture does, so `lockEvent` satisfies the
  // `Event` return type rather than a hand-built partial.
  const storedEvent = (registrationMode: "rsvp" | "ticketed") => {
    const row = {id: "11111111-1111-4111-8111-111111111111", ...base, startsAt: new Date(base.startsAt), titleZh: null, descriptionZh: null, endsAt: null, venue: null, capacity: null, memberOnly: false, published: false, heroMediaId: null, createdAt: new Date(), updatedAt: new Date()};
    return {...row, ...legacyDerivedEventColumns(row), registrationMode};
  };
  const dependencies = (inserted = vi.fn(async (input) => ({id: "11111111-1111-4111-8111-111111111111", ...input}))): EventMutationDependencies => ({
    transaction: (work) => work({insertEvent: inserted, lockEvent: vi.fn(), updateEvent: vi.fn(), lockActiveMedia: vi.fn(), insertAudit: vi.fn(async () => undefined)}),
  });

  it("rejects a ticketed event with no price", async () => {
    await expect(createEvent(staff, {...base, registrationMode: "ticketed"}, dependencies())).rejects.toThrow("ticketPriceHkdCents is required for ticketed events");
  });

  it("rejects a price on a non-ticketed event", async () => {
    await expect(createEvent(staff, {...base, registrationMode: "rsvp", ticketPriceHkdCents: 25_000}, dependencies())).rejects.toThrow("ticketPriceHkdCents is only valid for ticketed events");
  });

  it("carries a ticketed price to the insert", async () => {
    const inserted = vi.fn(async (input) => ({id: "11111111-1111-4111-8111-111111111111", ...input}));
    await createEvent(staff, {...base, registrationMode: "ticketed", ticketPriceHkdCents: 25_000}, dependencies(inserted));
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({registrationMode: "ticketed", ticketPriceHkdCents: 25_000}));
  });

  // A price-only partial update sends no `registrationMode`, so the shape rule
  // above cannot see the conflict: the row's own mode has to decide, and the
  // `events_ticketed_price_check` table check is satisfied by a non-ticketed row
  // carrying a price. Without the update-path guard this writes.
  it("refuses a price-only update on a non-ticketed row", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const current = storedEvent("rsvp");
    const update = vi.fn(async (updateId, input) => ({id: updateId, ...input}));
    const updateDependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: vi.fn(), lockEvent: async () => current, updateEvent: update, lockActiveMedia: vi.fn(), insertAudit: vi.fn(async () => undefined)})};
    await expect(updateEvent(staff, id, {ticketPriceHkdCents: 25_000}, updateDependencies)).rejects.toThrow("ticketPriceHkdCents is only valid for ticketed events");
    expect(update).not.toHaveBeenCalled();
  });

  // The brief's carve-out, pinned: a legitimate partial update that only changes
  // the price of an already-ticketed row must still be accepted.
  it("accepts a price-only update on an already-ticketed row", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const current = storedEvent("ticketed");
    const update = vi.fn(async (updateId, input) => ({id: updateId, ...input}));
    const updateDependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: vi.fn(), lockEvent: async () => current, updateEvent: update, lockActiveMedia: vi.fn(), insertAudit: vi.fn(async () => undefined)})};
    await expect(updateEvent(staff, id, {ticketPriceHkdCents: 25_000}, updateDependencies)).resolves.toMatchObject({ticketPriceHkdCents: 25_000});
    expect(update).toHaveBeenCalledWith(id, expect.objectContaining({ticketPriceHkdCents: 25_000}));
  });
});

// Staff-authorised only: the member schema omits the price, so a member cannot
// set one even by posting the field, and cannot select the one mode that needs
// it. The portal form already offers only rsvp and external; this is the layer
// that holds if that form is bypassed.
describe("a member event can never carry a price", () => {
  const member: Actor = {kind: "member", userId: "u", profileId: "member-1"};
  const company = "22222222-2222-4222-8222-222222222222";
  const input = {slug: "ai-clinic", titleEn: "AI clinic", descriptionEn: "Hands on", startsAt: new Date("2099-09-01T02:00:00Z"), visibility: "public" as const, registrationMode: "rsvp" as const, heroMediaId: null};
  function memberDependencies() {
    const execute = vi.fn<(query: unknown) => Promise<Record<string, unknown>[]>>(async () => []);
    const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
    const dependencies: MemberEventDependencies = {loadDatabase: async () => database as never, getCompanyRole: async () => "admin"};
    return {execute, dependencies};
  }

  it("refuses a member input that names a price", async () => {
    const {execute, dependencies} = memberDependencies();
    await expect(saveMemberEventDraft(member, company, {...input, ticketPriceHkdCents: 25_000}, dependencies)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a member ticketed event, which would need a price the member cannot set", async () => {
    const {execute, dependencies} = memberDependencies();
    await expect(saveMemberEventDraft(member, company, {...input, registrationMode: "ticketed"}, dependencies)).rejects.toThrow("ticketPriceHkdCents is required for ticketed events");
    expect(execute).not.toHaveBeenCalled();
  });
});
