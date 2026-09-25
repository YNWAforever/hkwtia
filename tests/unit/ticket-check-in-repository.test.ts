import {describe, expect, it, vi} from "vitest";

import {createTicketCheckInRepository, type PassView, type SeatRow, type TicketCheckInTransaction} from "@/lib/db/repos/ticket-check-in";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};
const eventId = "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d";
const otherEventId = "00000000-0000-4000-8000-000000000000";
const seatId = "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f";
const orderId = "order-1";
const occurredAt = new Date("2026-09-15T09:30:00.000Z");
const earlier = new Date("2026-09-15T09:00:00.000Z");

function seatRow(overrides: Partial<SeatRow> = {}): SeatRow {
  return {
    seatId,
    eventId,
    position: 1,
    attendeeName: "Ada Lovelace",
    attendeeEmail: "ada@example.test",
    checkedInAt: null,
    orderId,
    orderStatus: "paid",
    eventStatus: "published",
    eventTitleEn: "Tech Night",
    eventTitleZh: "科技之夜",
    eventSlug: "tech-night",
    eventStartsAt: new Date("2026-10-01T10:00:00.000Z"),
    eventVenue: "HKSTP",
    buyerLocale: "zh-HK",
    ...overrides,
  };
}

function fake(overrides: Partial<{orderStatus: string; checkedInAt: Date | null; eventStatus: string; eventId: string; row: SeatRow | null}> = {}) {
  const row = overrides.row === null
    ? null
    : seatRow({
      eventId: overrides.eventId ?? eventId,
      orderStatus: overrides.orderStatus ?? "paid",
      eventStatus: overrides.eventStatus ?? "published",
      checkedInAt: overrides.checkedInAt ?? null,
    });
  // Both spies record the seat id they were handed: a selector that asked for
  // the wrong seat must not stay green. `passForSeat` must use `readSeat` and
  // never take the write lock.
  const readSeat = vi.fn(async () => row);
  const lockSeat = vi.fn(async () => row);
  const lockEvent = vi.fn(async () => row?.eventStatus ?? null);
  const update = vi.fn(async () => undefined);
  const insertAudit = vi.fn(async () => undefined);
  const transaction = {readSeat, lockEvent, lockSeat, update, insertAudit};
  return {transaction, readSeat, lockEvent, lockSeat, update, insertAudit};
}

function repository(transaction: TicketCheckInTransaction) {
  return createTicketCheckInRepository({transaction: async (work) => work(transaction), now: () => occurredAt});
}

function view(overrides: Partial<PassView> = {}): PassView {
  return {
    seatId,
    orderId,
    eventId,
    position: 1,
    attendeeName: "Ada Lovelace",
    checkedInAt: null,
    eventTitleEn: "Tech Night",
    eventTitleZh: "科技之夜",
    eventSlug: "tech-night",
    eventStartsAt: new Date("2026-10-01T10:00:00.000Z"),
    eventVenue: "HKSTP",
    buyerLocale: "zh-HK",
    ...overrides,
  };
}

describe("ticket check-in repository", () => {
  it("passForSeat returns an active result for a paid order", async () => {
    const {transaction, readSeat, lockSeat} = fake();
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "active", view: view()});
    // A public read must not take the row lock, and it must select the seat it
    // was asked for — a wrong-seat selector would otherwise stay green.
    expect(readSeat).toHaveBeenCalledWith(seatId);
    expect(lockSeat).not.toHaveBeenCalled();
  });

  it.each([
    "refunded",
    "expired",
    "pending",
    "failed",
  ])("passForSeat returns unavailable for a %s order", async (orderStatus) => {
    const {transaction} = fake({orderStatus});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "unavailable"});
  });

  it("passForSeat returns cancelled for a paid seat whose event was cancelled", async () => {
    const {transaction} = fake({eventStatus: "cancelled"});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "cancelled", view: view()});
  });

  // The sweep refunds a cancelled event's paid orders, so the steady state of a
  // receipt link after cancellation is a refunded order under a cancelled event.
  // If `refunded` won, the link would 404 again exactly when the buyer needs it.
  it("passForSeat still returns cancelled after the sweep refunded the seat", async () => {
    const {transaction} = fake({eventStatus: "cancelled", orderStatus: "refunded"});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "cancelled", view: view()});
  });

  it("passForSeat returns unavailable for a never-paid seat of a cancelled event", async () => {
    const {transaction} = fake({eventStatus: "cancelled", orderStatus: "pending"});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "unavailable"});
  });

  it("passForSeat returns unavailable when the signed event id does not match the seat's", async () => {
    const {transaction} = fake({eventId: otherEventId});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "unavailable"});
  });

  it("passForSeat returns unavailable when the seat does not exist", async () => {
    const {transaction} = fake({row: null});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({status: "unavailable"});
  });

  it("checkInSeat sets checked_in_at and audits event.seat.checked_in", async () => {
    const {transaction, lockSeat, update, insertAudit} = fake();
    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "checked_in"});
    expect(lockSeat).toHaveBeenCalledWith(seatId);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(seatId, {checkedInAt: occurredAt});
    expect(insertAudit).toHaveBeenCalledTimes(1);
    expect(insertAudit).toHaveBeenCalledWith({
      actorUserId: "auth-1",
      actorType: "staff",
      action: "event.seat.checked_in",
      targetType: "event_order_seat",
      targetId: seatId,
      metadata: {eventId, orderId, position: 1},
    });
  });

  it("locks the event before the seat and refuses a cancellation that won the race", async () => {
    const calls: string[] = [];
    const readSeat = vi.fn(async () => { calls.push("readSeat"); return seatRow(); });
    const lockEvent = vi.fn(async () => { calls.push("lockEvent"); return "cancelled"; });
    const lockSeat = vi.fn(async () => { calls.push("lockSeat"); return seatRow(); });
    const update = vi.fn(async () => undefined);
    const insertAudit = vi.fn(async () => undefined);
    const transaction = {readSeat, lockEvent, lockSeat, update, insertAudit};

    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "not_admissible"});
    expect(calls).toEqual(["readSeat", "lockEvent"]);
    expect(lockEvent).toHaveBeenCalledWith(eventId);
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("checkInSeat on an already-checked-in seat returns already_checked_in and writes nothing", async () => {
    const {transaction, update, insertAudit} = fake({checkedInAt: earlier});
    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "already_checked_in"});
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("checkInSeat writes once across a double scan", async () => {
    let checkedInAt: Date | null = null;
    const update = vi.fn(async (_seatId: string, patch: Readonly<{checkedInAt: Date | null}>) => { checkedInAt = patch.checkedInAt; });
    const insertAudit = vi.fn(async () => undefined);
    const transaction = {
      readSeat: async () => seatRow({checkedInAt}),
      lockEvent: async () => "published",
      lockSeat: async () => seatRow({checkedInAt}),
      update,
      insertAudit,
    };
    const repo = repository(transaction);
    await expect(repo.checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "checked_in"});
    await expect(repo.checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "already_checked_in"});
    expect(update).toHaveBeenCalledTimes(1);
    expect(insertAudit).toHaveBeenCalledTimes(1);
  });

  it.each([
    "refunded",
    "expired",
    "pending",
    "failed",
  ])("checkInSeat returns not_admissible for a %s order", async (orderStatus) => {
    const {transaction, update, insertAudit} = fake({orderStatus});
    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "not_admissible"});
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("checkInSeat returns not_admissible for a cancelled event", async () => {
    const {transaction, update, insertAudit} = fake({eventStatus: "cancelled"});
    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "not_admissible"});
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("checkInSeat returns not_admissible when the seat does not exist", async () => {
    const {transaction, update, insertAudit} = fake({row: null});
    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "not_admissible"});
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("undoSeatCheckIn clears checked_in_at and audits event.seat.check_in_reversed", async () => {
    const {transaction, update, insertAudit} = fake({checkedInAt: earlier});
    await expect(repository(transaction).undoSeatCheckIn(staff, {seatId})).resolves.toEqual({disposition: "undone"});
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(seatId, {checkedInAt: null});
    expect(insertAudit).toHaveBeenCalledTimes(1);
    expect(insertAudit).toHaveBeenCalledWith({
      actorUserId: "auth-1",
      actorType: "staff",
      action: "event.seat.check_in_reversed",
      targetType: "event_order_seat",
      targetId: seatId,
      metadata: {eventId, orderId, position: 1},
    });
  });

  it("undoSeatCheckIn on a seat that is not checked in returns not_checked_in and writes nothing", async () => {
    const {transaction, update, insertAudit} = fake({checkedInAt: null});
    await expect(repository(transaction).undoSeatCheckIn(staff, {seatId})).resolves.toEqual({disposition: "not_checked_in"});
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("undoSeatCheckIn returns not_checked_in when the seat does not exist", async () => {
    const {transaction, update, insertAudit} = fake({row: null});
    await expect(repository(transaction).undoSeatCheckIn(staff, {seatId})).resolves.toEqual({disposition: "not_checked_in"});
    expect(update).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });
});
