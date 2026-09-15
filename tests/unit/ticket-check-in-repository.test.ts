import {describe, expect, it, vi} from "vitest";

import {createTicketCheckInRepository, type SeatRow, type TicketCheckInTransaction} from "@/lib/db/repos/ticket-check-in";

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
  const update = vi.fn(async () => undefined);
  const insertAudit = vi.fn(async () => undefined);
  const transaction: TicketCheckInTransaction = {
    lockSeat: vi.fn(async () => overrides.row === null
      ? null
      : seatRow({
        eventId: overrides.eventId ?? eventId,
        orderStatus: overrides.orderStatus ?? "paid",
        eventStatus: overrides.eventStatus ?? "published",
        checkedInAt: overrides.checkedInAt ?? null,
      })),
    update,
    insertAudit,
  };
  return {transaction, update, insertAudit};
}

function repository(transaction: TicketCheckInTransaction) {
  return createTicketCheckInRepository({transaction: async (work) => work(transaction), now: () => occurredAt});
}

describe("ticket check-in repository", () => {
  it("passForSeat returns the seat facts for a paid order", async () => {
    const {transaction} = fake();
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toEqual({
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
    });
  });

  it.each([
    "refunded",
    "expired",
    "pending",
    "failed",
  ])("passForSeat returns null for a %s order", async (orderStatus) => {
    const {transaction} = fake({orderStatus});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toBeNull();
  });

  it("passForSeat returns null for a cancelled event", async () => {
    const {transaction} = fake({eventStatus: "cancelled"});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toBeNull();
  });

  it("passForSeat returns null when the signed event id does not match the seat's", async () => {
    const {transaction} = fake({eventId: otherEventId});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toBeNull();
  });

  it("passForSeat returns null when the seat does not exist", async () => {
    const {transaction} = fake({row: null});
    await expect(repository(transaction).passForSeat({seatId, eventId})).resolves.toBeNull();
  });

  it("checkInSeat sets checked_in_at and audits event.seat.checked_in", async () => {
    const {transaction, update, insertAudit} = fake();
    await expect(repository(transaction).checkInSeat(staff, {seatId})).resolves.toEqual({disposition: "checked_in"});
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
    const transaction: TicketCheckInTransaction = {
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
