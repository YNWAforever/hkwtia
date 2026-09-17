import "server-only";

import {eq} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import {auditEvents, eventOrderSeats, eventOrders, events} from "@/lib/db/server-schema";
import type {PassClaims} from "@/lib/tickets/pass-token";
import type {AdminActor} from "@/lib/membership/lifecycle";

/** The facts a pass may disclose. Never the order's other seats, never the buyer. */
export type PassView = Readonly<{
  seatId: string; orderId: string; eventId: string; position: number;
  attendeeName: string; checkedInAt: Date | null;
  eventTitleEn: string; eventTitleZh: string | null; eventSlug: string;
  eventStartsAt: Date; eventVenue: string | null; buyerLocale: "en" | "zh-HK";
}>;

export type SeatRow = Readonly<{
  seatId: string; eventId: string; position: number; attendeeName: string; attendeeEmail: string;
  checkedInAt: Date | null; orderId: string; orderStatus: string; eventStatus: string;
  eventTitleEn?: string; eventTitleZh?: string | null; eventSlug?: string; eventStartsAt?: Date;
  eventVenue?: string | null; buyerLocale?: "en" | "zh-HK";
}>;

/**
 * Phase D-4d: a seat read is discriminated so a cancelled event can be
 * explained rather than collapsed into "not found". `unavailable` (an unpaid,
 * refunded or invalid seat) still 404s; only `cancelled` gains a rendered
 * state, because the holder of a receipt link deserves to know the event is
 * not happening rather than see a broken-link page.
 */
export type PassSeatResult =
  | Readonly<{status: "active"; view: PassView}>
  | Readonly<{status: "cancelled"; view: PassView}>
  | Readonly<{status: "unavailable"}>;

export type TicketCheckInTransaction = Readonly<{
  /** A plain read for the public pass page: the row is never locked. */
  readSeat: (seatId: string) => Promise<SeatRow | null>;
  /** The write lock for check-in and undo, where two scanners must serialize. */
  lockSeat: (seatId: string) => Promise<SeatRow | null>;
  update: (seatId: string, patch: Readonly<{checkedInAt: Date | null}>) => Promise<void>;
  insertAudit: (input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>) => Promise<void>;
}>;

export type TicketCheckInDependencies = Readonly<{
  transaction: <T>(work: (transaction: TicketCheckInTransaction) => Promise<T>) => Promise<T>;
  now: () => Date;
}>;

function inadmissible(row: SeatRow): boolean {
  return row.orderStatus !== "paid" || row.eventStatus === "cancelled";
}

function passView(row: SeatRow): PassView {
  return {
    seatId: row.seatId,
    orderId: row.orderId,
    eventId: row.eventId,
    position: row.position,
    attendeeName: row.attendeeName,
    checkedInAt: row.checkedInAt,
    eventTitleEn: row.eventTitleEn ?? "",
    eventTitleZh: row.eventTitleZh ?? null,
    eventSlug: row.eventSlug ?? "",
    eventStartsAt: row.eventStartsAt ?? new Date(0),
    eventVenue: row.eventVenue ?? null,
    buyerLocale: row.buyerLocale ?? "en",
  };
}

/**
 * The order statuses that mean the seat was actually sold. A refunded seat was
 * paid and then refunded — the steady state of a cancelled event's order once
 * the sweep has run — so it still counts; a pending, failed or expired order
 * never was sold and so never held a pass.
 */
function wasPaid(orderStatus: string): boolean {
  return orderStatus === "paid" || orderStatus === "refunded";
}

export function createTicketCheckInRepository(
  overrides: Partial<TicketCheckInDependencies> = {},
): Readonly<{
  passForSeat: (claims: PassClaims) => Promise<PassSeatResult>;
  checkInSeat: (actor: AdminActor, input: Readonly<{seatId: string}>) => Promise<Readonly<{disposition: "checked_in" | "already_checked_in" | "not_admissible"}>>;
  undoSeatCheckIn: (actor: AdminActor, input: Readonly<{seatId: string}>) => Promise<Readonly<{disposition: "undone" | "not_checked_in"}>>;
}> {
  const dependencies: TicketCheckInDependencies = {
    transaction: async (work) => (await getDb()).transaction(async (tx) => {
      // One select for both reads: `passForSeat` is a public read and must not
      // lock the row, while `checkInSeat`/`undoSeatCheckIn` take the lock so two
      // scanners serialize into one write. The seat row carries no event of its
      // own: the event is read through the order so a seat cannot disagree with
      // its order about the event.
      const selectSeat = (seatId: string) => tx.select({
        seatId: eventOrderSeats.id,
        eventId: eventOrders.eventId,
        position: eventOrderSeats.position,
        attendeeName: eventOrderSeats.attendeeName,
        attendeeEmail: eventOrderSeats.attendeeEmail,
        checkedInAt: eventOrderSeats.checkedInAt,
        orderId: eventOrders.id,
        orderStatus: eventOrders.status,
        eventStatus: events.status,
        eventTitleEn: events.titleEn,
        eventTitleZh: events.titleZh,
        eventSlug: events.slug,
        eventStartsAt: events.startsAt,
        eventVenue: events.venue,
        buyerLocale: eventOrders.buyerLocale,
      }).from(eventOrderSeats)
        .innerJoin(eventOrders, eq(eventOrders.id, eventOrderSeats.orderId))
        .innerJoin(events, eq(events.id, eventOrders.eventId))
        .where(eq(eventOrderSeats.id, seatId));
      // The column is text; the application only ever writes these two values,
      // so narrow it here rather than widening the contract every reader sees.
      const narrow = <T extends {buyerLocale: string}>(row: T): T & Readonly<{buyerLocale: "en" | "zh-HK"}> => ({...row, buyerLocale: row.buyerLocale === "zh-HK" ? "zh-HK" : "en"});
      return work({
        readSeat: async (seatId) => {
          const row = (await selectSeat(seatId))[0];
          return row ? narrow(row) : null;
        },
        lockSeat: async (seatId) => {
          const row = (await selectSeat(seatId).for("update", {of: eventOrderSeats}))[0];
          return row ? narrow(row) : null;
        },
        update: async (seatId, patch) => {
          await tx.update(eventOrderSeats).set({checkedInAt: patch.checkedInAt}).where(eq(eventOrderSeats.id, seatId));
        },
        insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
      });
    }),
    now: () => new Date(),
    ...overrides,
  };

  function auditFor(row: SeatRow, action: string): Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}> {
    return {actorUserId: null, actorType: "system", action, targetType: "event_order_seat", targetId: row.seatId, metadata: {eventId: row.eventId, orderId: row.orderId, position: row.position}};
  }

  return {
    async passForSeat(claims) {
      return dependencies.transaction(async (tx) => {
        const row = await tx.readSeat(claims.seatId);
        // The event id must match the one that was signed: a token is for one
        // seat of one event, so a seat later moved between events is refused.
        if (!row || row.eventId !== claims.eventId) return {status: "unavailable"};
        const view = passView(row);
        // A cancelled event dominates the seat's order status: the buyer's
        // receipt link must keep explaining the cancellation even after the
        // sweep has refunded the order. Refused only when the order was never
        // sold, so an unfinished checkout on a cancelled event still 404s.
        if (row.eventStatus === "cancelled") {
          return wasPaid(row.orderStatus) ? {status: "cancelled", view} : {status: "unavailable"};
        }
        if (inadmissible(row)) return {status: "unavailable"};
        return {status: "active", view};
      });
    },

    async checkInSeat(actor, input) {
      const occurredAt = dependencies.now();
      return dependencies.transaction(async (tx) => {
        const row = await tx.lockSeat(input.seatId);
        if (!row || inadmissible(row)) return {disposition: "not_admissible" as const};
        // The lock makes a double scan a no-op rather than two admissions.
        if (row.checkedInAt) return {disposition: "already_checked_in" as const};
        await tx.update(row.seatId, {checkedInAt: occurredAt});
        const audit = auditFor(row, "event.seat.checked_in");
        await tx.insertAudit({...audit, actorUserId: actor.userId, actorType: actor.kind});
        return {disposition: "checked_in" as const};
      });
    },

    async undoSeatCheckIn(actor, input) {
      return dependencies.transaction(async (tx) => {
        const row = await tx.lockSeat(input.seatId);
        if (!row || row.checkedInAt === null) return {disposition: "not_checked_in" as const};
        await tx.update(row.seatId, {checkedInAt: null});
        const audit = auditFor(row, "event.seat.check_in_reversed");
        await tx.insertAudit({...audit, actorUserId: actor.userId, actorType: actor.kind});
        return {disposition: "undone" as const};
      });
    },
  };
}

export const ticketCheckInRepository = createTicketCheckInRepository();
