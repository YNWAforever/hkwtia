import "server-only";

import {eq, sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {MAX_TICKET_SEATS, TICKET_HOLD_MS} from "@/config/tickets";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, eventOrderSeats, eventOrders, events} from "@/lib/db/server-schema";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "refunded" | "refund_failed";
export type RefundReason = "oversold" | "staff" | "cancelled";
export type RefundReconciliationInput = Readonly<{
  refundedAt: Date; expectedAmountHkdCents: number; actorUserId: string | null;
  actorType: string; refundReason: RefundReason; reason: string; note: string | null;
  stripeEventId: string | null;
}>;

export type OrderRecord = Readonly<{
  id: string; eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  buyerLocale: "en" | "zh-HK";
  amountHkdCents: number; currency: string; status: OrderStatus; stripeCheckoutSessionId: string | null;
  stripeCheckoutUrl: string | null;
  idempotencyKey: string; expiresAt: Date; paidAt: Date | null; refundedAt: Date | null; refundReason: RefundReason | null;
}>;

export type EventOrderRow = Readonly<{
  order: OrderRecord;
  seatCount: number;
  seatNames: readonly string[];
}>;

export type LockedEvent = Readonly<{
  id: string; capacity: number | null; published: boolean; startsAt: Date; endsAt: Date | null;
  registrationMode: string; ticketPriceHkdCents: number | null;
}>;

export type TicketEvent = Readonly<{
  id: string; slug: string; titleEn: string; titleZh: string; startsAt: Date;
  published: boolean; registrationMode: string; ticketPriceHkdCents: number | null;
}>;

export type SeatInput = Readonly<{name: string; email: string}>;

export type CreateOrderInput = Readonly<{
  eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  buyerLocale: "en" | "zh-HK";
  idempotencyKey: string; seats: readonly SeatInput[]; amountHkdCents: number; now: Date;
}>;

export type CreateOrderResult =
  | Readonly<{ok: true; order: OrderRecord; reused: boolean}>
  | Readonly<{ok: false; reason: "EVENT_NOT_FOUND" | "EVENT_NOT_TICKETED" | "EVENT_CLOSED" | "AMOUNT_MISMATCH" | "SOLD_OUT" | "ATTEMPT_CHANGED"}>;

export type SettleResult =
  | Readonly<{status: "paid" | "duplicate" | "ignored" | "oversold" | "refund_due" | "unknown"; order: OrderRecord | null}>;

export type EventOrdersTransaction = Readonly<{
  lockEvent: (eventId: string) => Promise<LockedEvent | null>;
  orderByIdempotencyKey: (key: string) => Promise<OrderRecord | null>;
  orderBySessionId: (sessionId: string) => Promise<OrderRecord | null>;
  seatsOfOrder: (orderId: string) => Promise<number>;
  /**
   * Every seat of an order in position order. `attendeeName` rides along because
   * the receipt names the attendees and the per-attendee passes need each id:
   * one read serves both, rather than a second query per recipient.
   */
  orderSeats: (orderId: string) => Promise<readonly Readonly<{seatId: string; position: number; attendeeName: string; attendeeEmail: string}>[]>;
  /** One seat with its paid order, for a single pass. */
  seatForPass: (seatId: string) => Promise<Readonly<{seatId: string; attendeeName: string; attendeeEmail: string; eventId: string; buyerLocale: "en" | "zh-HK"; order: OrderRecord}> | null>;
  /** Seats of paid orders, or of pending ones whose hold has not lapsed. */
  heldSeats: (eventId: string, now: Date, excludingOrderId?: string) => Promise<number>;
  /** Seats of paid orders only -- the subset of `heldSeats` that has been bought. */
  paidSeats: (eventId: string) => Promise<number>;
  insertOrder: (input: CreateOrderInput & {expiresAt: Date; status: "pending"}) => Promise<OrderRecord>;
  insertSeats: (orderId: string, seats: readonly SeatInput[]) => Promise<void>;
  attachSession: (orderId: string, sessionId: string, url: string) => Promise<void>;
  markStatus: (orderId: string, status: OrderStatus, patch: Readonly<{paidAt?: Date; refundedAt?: Date; refundReason?: RefundReason}>) => Promise<void>;
  orderById: (orderId: string) => Promise<OrderRecord | null>;
  /** Every order of an event with its seats, newest paid first. */
  listEventOrders: (eventId: string) => Promise<readonly EventOrderRow[]>;
  /** Orders still owed a refund because their event was cancelled. */
  ordersAwaitingCancellationRefund: (limit: number) => Promise<readonly Readonly<{orderId: string; eventId: string}>[]>;
  /** Move a pending or failed attempt to the retry tail while it remains unsettled. */
  deferUnsettledCancellationRefund: (orderId: string) => Promise<void>;
  /**
   * The refund commit: moves the row only while it is still `paid`, and writes
   * the audit row in the same transaction. `false` means someone else got there
   * first, which is a result rather than an error.
   *
   * `refundReason` is the column's coarse enum; `reason` is the issuer-specific
   * audit value. They are carried rather than hardcoded because a staff refund
   * and the event-cancellation sweep both land here and a report must be able to
   * tell them apart (D-4d whole-branch finding).
   */
  refundPaidOrder: (orderId: string, input: Readonly<{refundedAt: Date; actorUserId: string | null; actorType: string; refundReason: RefundReason; reason: string; note: string | null}>) => Promise<boolean>;
  reconcileRefundedOrder: (orderId: string, input: RefundReconciliationInput) => Promise<boolean>;
  markRefundFailed: (orderId: string, input: Readonly<{eventId: string; refundId: string; amountHkdCents: number}>) => Promise<boolean>;
  insertAudit: (input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>) => Promise<void>;
  eventSummary: (eventId: string) => Promise<readonly Readonly<{titleEn: string; titleZh: string | null; startsAt: Date; slug: string; venue: string | null}>[]>;
}>;

const seatSchema = z.object({name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().pipe(z.string().email().max(320))}).strict();
export const ticketSeatsSchema = z.array(seatSchema).min(1).max(MAX_TICKET_SEATS);

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as {rows: T[]}).rows;
  return [];
}

function requiredDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("INVALID_REPOSITORY_DATE");
  return date;
}

function optionalDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : requiredDate(value);
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * A `SELECT *` returns snake_case, so the row is folded here rather than cast.
 * A bare `as OrderRecord` would be a lie that only surfaces when a caller reads
 * `order.eventId` and finds undefined.
 */
function orderFrom(row: Record<string, unknown>): OrderRecord {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    buyerProfileId: optionalString(row.buyer_profile_id),
    buyerName: String(row.buyer_name),
    buyerEmail: String(row.buyer_email),
    buyerLocale: String(row.buyer_locale) as OrderRecord["buyerLocale"],
    amountHkdCents: Number(row.amount_hkd_cents),
    currency: String(row.currency),
    status: String(row.status) as OrderStatus,
    stripeCheckoutSessionId: optionalString(row.stripe_checkout_session_id),
    stripeCheckoutUrl: optionalString(row.stripe_checkout_url),
    idempotencyKey: String(row.idempotency_key),
    expiresAt: requiredDate(row.expires_at),
    paidAt: optionalDate(row.paid_at),
    refundedAt: optionalDate(row.refunded_at),
    refundReason: optionalString(row.refund_reason) as RefundReason | null,
  };
}

/**
 * The lock row is aliased to camelCase in the SQL, but a driver returning
 * `timestamptz` as a string would still leave `startsAt` a string typed as a
 * `Date`. Folding it through the same helpers as `orderFrom` keeps the type
 * honest for Task 7, which formats `eventSummary.startsAt`.
 */
function lockedEventFrom(row: Record<string, unknown>): LockedEvent {
  return {
    id: String(row.id),
    capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    published: Boolean(row.published),
    startsAt: requiredDate(row.startsAt),
    endsAt: optionalDate(row.endsAt),
    registrationMode: String(row.registrationMode),
    ticketPriceHkdCents: row.ticketPriceHkdCents === null || row.ticketPriceHkdCents === undefined ? null : Number(row.ticketPriceHkdCents),
  };
}

function eventSummaryFrom(row: Record<string, unknown>): {titleEn: string; titleZh: string | null; startsAt: Date; slug: string; venue: string | null} {
  return {
    titleEn: String(row.titleEn),
    titleZh: optionalString(row.titleZh),
    startsAt: requiredDate(row.startsAt),
    slug: String(row.slug),
    venue: optionalString(row.venue),
  };
}

/**
 * The audit INSERT, written once. `refundPaidOrder` runs inside the default
 * transaction where the only handle is the driver `tx`, so it cannot reach the
 * built `insertAudit` sibling -- both delegate here rather than letting the two
 * copies of the statement drift.
 */
async function writeAuditRow(
  tx: Readonly<{execute: (query: SQL) => Promise<unknown>}>,
  input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>,
): Promise<void> {
  await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${input.actorUserId}, ${input.actorType}, ${input.action}, ${input.targetType}, ${input.targetId}, ${JSON.stringify(input.metadata)}::jsonb)`);
}

async function defaultTransaction<T>(work: (tx: EventOrdersTransaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => work({
    lockEvent: async (eventId) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`
        SELECT id, capacity, published, starts_at AS "startsAt", ends_at AS "endsAt",
               registration_mode AS "registrationMode", ticket_price_hkd_cents AS "ticketPriceHkdCents"
        FROM ${events} WHERE id = ${eventId} FOR UPDATE
      `))[0];
      return row ? lockedEventFrom(row) : null;
    },
    orderByIdempotencyKey: async (key) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE idempotency_key = ${key} LIMIT 1`))[0];
      return row ? orderFrom(row) : null;
    },
    orderBySessionId: async (sessionId) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE stripe_checkout_session_id = ${sessionId} LIMIT 1 FOR UPDATE`))[0];
      return row ? orderFrom(row) : null;
    },
    seatsOfOrder: async (orderId) => Number(rows<{value: number}>(await tx.execute(sql`SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} WHERE order_id = ${orderId}`))[0]?.value ?? 0),
    orderSeats: async (orderId) => rows<{seatId: string; position: number; attendeeName: string; attendeeEmail: string}>(await tx.execute(sql`
      SELECT id AS "seatId", position, attendee_name AS "attendeeName", attendee_email AS "attendeeEmail" FROM ${eventOrderSeats} WHERE order_id = ${orderId} ORDER BY position ASC
    `)),
    seatForPass: async (seatId) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`
        SELECT s.id AS "seatId", s.attendee_name AS "attendeeName", s.attendee_email AS "attendeeEmail",
               o.event_id AS "eventId", o.buyer_locale AS "buyerLocale", o.*
        FROM ${eventOrderSeats} s JOIN ${eventOrders} o ON o.id = s.order_id
        WHERE s.id = ${seatId} AND o.status = 'paid' LIMIT 1
      `))[0];
      if (!row) return null;
      // `o.*` arrives snake_case; `orderFrom` is the existing folder that already
      // handles those columns, so the order is folded once, not mapped twice.
      return {seatId: String(row.seatId), attendeeName: String(row.attendeeName), attendeeEmail: String(row.attendeeEmail), eventId: String(row.eventId), buyerLocale: row.buyerLocale === "zh-HK" ? "zh-HK" : "en", order: orderFrom(row)};
    },
    heldSeats: async (eventId, now, excludingOrderId) => Number(rows<{value: number}>(await tx.execute(sql`
      SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} AS s
      JOIN ${eventOrders} AS o ON o.id = s.order_id
      WHERE o.event_id = ${eventId}
        AND (${excludingOrderId === undefined ? sql`TRUE` : sql`o.id <> ${excludingOrderId}`})
        AND (o.status = 'paid' OR (o.status = 'pending' AND o.expires_at > ${now}))
    `))[0]?.value ?? 0),
    paidSeats: async (eventId) => Number(rows<{value: number}>(await tx.execute(sql`
      SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} AS s
      JOIN ${eventOrders} AS o ON o.id = s.order_id
      WHERE o.event_id = ${eventId} AND o.status = 'paid'
    `))[0]?.value ?? 0),
    insertOrder: async (input) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`
        INSERT INTO ${eventOrders} (id, event_id, buyer_profile_id, buyer_name, buyer_email, buyer_locale, amount_hkd_cents, currency, status, idempotency_key, expires_at, created_at, updated_at)
        VALUES (gen_random_uuid(), ${input.eventId}, ${input.buyerProfileId}, ${input.buyerName}, ${input.buyerEmail}, ${input.buyerLocale}, ${input.amountHkdCents}, 'hkd', 'pending', ${input.idempotencyKey}, ${input.expiresAt}, NOW(), NOW())
        RETURNING *
      `))[0];
      if (!row) throw new Error("EVENT_ORDER_INSERT_FAILED");
      return orderFrom(row);
    },
    insertSeats: async (orderId, seats) => { for (const [index, seat] of seats.entries()) await tx.execute(sql`INSERT INTO ${eventOrderSeats} (order_id, position, attendee_name, attendee_email, created_at) VALUES (${orderId}, ${index + 1}, ${seat.name}, ${seat.email}, NOW())`); },
    attachSession: async (orderId, sessionId, url) => { await tx.execute(sql`UPDATE ${eventOrders} SET stripe_checkout_session_id = ${sessionId}, stripe_checkout_url = ${url}, updated_at = NOW() WHERE id = ${orderId}`); },
    // The patch is genuinely partial: only the columns it supplies are written.
    // Setting every column on every transition would let the NEXT transition
    // erase the previous one -- a staff refund (D-4c) would null `paid_at`, and
    // an expiry would null a refund beside it.
    markStatus: async (orderId, status, patch) => {
      const assignments = [sql`status = ${status}`];
      if (patch.paidAt !== undefined) assignments.push(sql`paid_at = ${patch.paidAt}`);
      if (patch.refundedAt !== undefined) assignments.push(sql`refunded_at = ${patch.refundedAt}`);
      if (patch.refundReason !== undefined) assignments.push(sql`refund_reason = ${patch.refundReason}`);
      assignments.push(sql`updated_at = NOW()`);
      await tx.execute(sql`UPDATE ${eventOrders} SET ${sql.join(assignments, sql`, `)} WHERE id = ${orderId}`);
    },
    orderById: async (orderId) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE id = ${orderId} LIMIT 1`))[0];
      return row ? orderFrom(row) : null;
    },
    listEventOrders: async (eventId) => rows<Record<string, unknown>>(await tx.execute(sql`
      SELECT o.*, COALESCE(seats.seat_names, ARRAY[]::text[]) AS seat_names, COALESCE(seats.seat_count, 0) AS seat_count
      FROM ${eventOrders} o
      LEFT JOIN (
        SELECT order_id, array_agg(attendee_name ORDER BY position ASC) AS seat_names, count(*)::int AS seat_count
        FROM ${eventOrderSeats} GROUP BY order_id
      ) seats ON seats.order_id = o.id
      WHERE event_id = ${eventId}
      ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC
    `)).map((row) => ({
      order: orderFrom(row),
      seatCount: Number(row.seat_count),
      seatNames: Array.isArray(row.seat_names) ? (row.seat_names as string[]) : [],
    })),
    ordersAwaitingCancellationRefund: async (limit) => rows<{orderId: string; eventId: string}>(await tx.execute(sql`
      SELECT o.id AS "orderId", o.event_id AS "eventId"
      FROM ${eventOrders} o JOIN ${events} e ON e.id = o.event_id
      WHERE o.status IN ('paid', 'refund_failed') AND e.status = 'cancelled'
      ORDER BY o.updated_at ASC, o.id ASC
      LIMIT ${limit}
    `)),
    deferUnsettledCancellationRefund: async (orderId) => {
      await tx.execute(sql`UPDATE ${eventOrders} SET updated_at = NOW() WHERE id = ${orderId} AND status IN ('paid', 'refund_failed')`);
    },
    refundPaidOrder: async (orderId, input) => {
      // `AND status = 'paid'` is the whole guard: two staff clicking at once
      // produce one transition because the second UPDATE matches no row.
      const updated = rows<{id: string}>(await tx.execute(sql`
        UPDATE ${eventOrders}
        SET status = 'refunded', refunded_at = ${input.refundedAt}, refund_reason = ${input.refundReason}, updated_at = NOW()
        WHERE id = ${orderId} AND status = 'paid'
        RETURNING id
      `));
      if (updated.length === 0) return false;
      await writeAuditRow(tx, {
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        action: "event.order.refunded",
        targetType: "event_order",
        targetId: orderId,
        metadata: {reason: input.reason, note: input.note},
      });
      return true;
    },
    reconcileRefundedOrder: async (orderId, input) => {
      const updated = rows<{id: string}>(await tx.execute(sql`
        UPDATE ${eventOrders}
        SET status = 'refunded', refunded_at = ${input.refundedAt},
            refund_reason = COALESCE(refund_reason, ${input.refundReason}::event_refund_reason), updated_at = NOW()
        WHERE id = ${orderId} AND status IN ('paid', 'refund_failed')
          AND amount_hkd_cents = ${input.expectedAmountHkdCents}
        RETURNING id
      `));
      if (updated.length === 0) return false;
      await writeAuditRow(tx, {
        actorUserId: input.actorUserId, actorType: input.actorType,
        action: "event.order.refunded", targetType: "event_order", targetId: orderId,
        metadata: {reason: input.reason, note: input.note, stripeEventId: input.stripeEventId},
      });
      return true;
    },
    markRefundFailed: async (orderId, input) => {
      // Lock the order before checking the audit row. A pending refund keeps
      // status=paid, so status alone cannot dedupe its webhook redeliveries.
      const current = rows<{id: string; status: "paid" | "refunded"}>(await tx.execute(sql`
        SELECT id, status FROM ${eventOrders}
        WHERE id = ${orderId} AND status IN ('paid', 'refunded')
          AND amount_hkd_cents = ${input.amountHkdCents}
        FOR UPDATE
      `))[0];
      if (!current) return false;
      if (current.status === "paid") {
        const seen = rows<{id: string}>(await tx.execute(sql`
          SELECT id FROM ${auditEvents}
          WHERE target_type = 'event_order' AND target_id = ${orderId}
            AND action = 'event.order.refund_failed'
            AND metadata ->> 'stripeRefundId' = ${input.refundId}
          LIMIT 1
        `))[0];
        if (seen) return false;
      } else {
        const updated = rows<{id: string}>(await tx.execute(sql`
          UPDATE ${eventOrders}
          SET status = 'refund_failed', refunded_at = NULL, updated_at = NOW()
          WHERE id = ${orderId} AND status = 'refunded'
            AND amount_hkd_cents = ${input.amountHkdCents}
          RETURNING id
        `));
        if (updated.length === 0) return false;
      }
      await writeAuditRow(tx, {actorUserId: null, actorType: "system", action: "event.order.refund_failed",
        targetType: "event_order", targetId: orderId,
        metadata: {stripeEventId: input.eventId, stripeRefundId: input.refundId}});
      return true;
    },
    insertAudit: async (input) => { await writeAuditRow(tx, input); },
    eventSummary: async (eventId) => rows<Record<string, unknown>>(await tx.execute(sql`
      SELECT title_en AS "titleEn", title_zh AS "titleZh", starts_at AS "startsAt", slug, venue FROM ${events} WHERE id = ${eventId} LIMIT 1
    `)).map((row) => eventSummaryFrom(row)),
  }));
}

/**
 * The event a ticket checkout is being bought for. `title_zh` is nullable, so an
 * untranslated event shows its English title rather than naming the Stripe line
 * item "null" -- the same fallback `eventSummary` makes for the receipt.
 */
export async function ticketEventFor(eventId: string): Promise<TicketEvent | null> {
  const db = await getDb();
  const row = (await db.select({
    id: events.id, slug: events.slug, titleEn: events.titleEn, titleZh: events.titleZh, startsAt: events.startsAt,
    published: events.published, registrationMode: events.registrationMode, ticketPriceHkdCents: events.ticketPriceHkdCents,
  }).from(events).where(eq(events.id, eventId)).limit(1))[0];
  if (!row) return null;
  return {...row, titleZh: row.titleZh ?? row.titleEn};
}

export function createEventOrdersRepository(runTransaction: <T>(work: (tx: EventOrdersTransaction) => Promise<T>) => Promise<T> = defaultTransaction) {
  return {
    async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
      return runTransaction(async (tx) => {
        const event = await tx.lockEvent(input.eventId);
        if (!event) return {ok: false, reason: "EVENT_NOT_FOUND"};
        // The lock already holds the authoritative mode and price, so the
        // "a client-supplied amount is never read" invariant is enforced here
        // rather than resting on the caller being correct forever.
        if (event.registrationMode !== "ticketed" || event.ticketPriceHkdCents === null) {
          return {ok: false, reason: "EVENT_NOT_TICKETED"};
        }
        if (!event.published || event.startsAt <= input.now) return {ok: false, reason: "EVENT_CLOSED"};
        const existing = await tx.orderByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          // A key names one immutable purchase attempt. A failed Stripe call
          // can leave this order without a session; using the current form to
          // mint one would charge for different seats than this row records.
          if (existing.eventId !== input.eventId ||
              existing.buyerProfileId !== input.buyerProfileId ||
              existing.buyerName !== input.buyerName ||
              existing.buyerEmail !== input.buyerEmail ||
              existing.buyerLocale !== input.buyerLocale ||
              existing.amountHkdCents !== input.amountHkdCents) {
            return {ok: false, reason: "ATTEMPT_CHANGED"};
          }
          const previousSeats = await tx.orderSeats(existing.id);
          if (previousSeats.length !== input.seats.length ||
              previousSeats.some((seat, index) => seat.position !== index + 1 ||
                seat.attendeeName !== input.seats[index]?.name ||
                seat.attendeeEmail !== input.seats[index]?.email)) {
            return {ok: false, reason: "ATTEMPT_CHANGED"};
          }
          return {ok: true, order: existing, reused: true};
        }
        if (input.amountHkdCents !== event.ticketPriceHkdCents * input.seats.length) {
          return {ok: false, reason: "AMOUNT_MISMATCH"};
        }
        if (event.capacity !== null) {
          const held = await tx.heldSeats(input.eventId, input.now);
          if (held + input.seats.length > event.capacity) return {ok: false, reason: "SOLD_OUT"};
        }
        const expiresAt = new Date(input.now.getTime() + TICKET_HOLD_MS);
        const order = await tx.insertOrder({...input, expiresAt, status: "pending"});
        await tx.insertSeats(order.id, input.seats);
        await tx.insertAudit({actorUserId: input.buyerProfileId, actorType: input.buyerProfileId ? "member" : "guest", action: "event.order.created", targetType: "event_order", targetId: order.id, metadata: {eventId: input.eventId, seats: input.seats.length, amountHkdCents: input.amountHkdCents}});
        return {ok: true, order, reused: false};
      });
    },

    async attachSession(orderId: string, sessionId: string, url: string): Promise<void> {
      await runTransaction(async (tx) => { await tx.attachSession(orderId, sessionId, url); });
    },

    async settlePaid(sessionId: string, now: Date): Promise<SettleResult> {
      return runTransaction(async (tx) => {
        const order = await tx.orderBySessionId(sessionId);
        if (!order) return {status: "unknown", order: null};
        if (order.status === "paid") return {status: "duplicate", order};
        // A session can be paid in the moment it lapses locally, so an order we
        // already expired may still carry a real payment. Refund it rather than
        // answer `ignored`, which would take money and hand back no seats.
        if (order.status === "expired") {
          await tx.markStatus(order.id, "refunded", {refundedAt: now, refundReason: "cancelled"});
          await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.refunded", targetType: "event_order", targetId: order.id, metadata: {reason: "late_payment"}});
          return {status: "refund_due", order: {...order, status: "refunded", refundedAt: now, refundReason: "cancelled"}};
        }
        // A refund we committed but could not finish. The row is already
        // `refunded`, but if the provider call failed the money is still here, so
        // the retry must re-issue it — safe because the provider call carries the
        // deterministic `ticket-refund:<orderId>` idempotency key. `staff` refunds
        // (D-4c) are not this lane's to re-attempt.
        if (order.status === "refunded" && (order.refundReason === "oversold" || order.refundReason === "cancelled")) {
          return {status: "refund_due", order};
        }
        if (order.status !== "pending") return {status: "ignored", order};
        const event = await tx.lockEvent(order.eventId);
        if (event && !event.published) {
          await tx.markStatus(order.id, "refunded", {refundedAt: now, refundReason: "cancelled"});
          await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.refunded", targetType: "event_order", targetId: order.id, metadata: {reason: "event_closed"}});
          return {status: "refund_due", order: {...order, status: "refunded", refundedAt: now, refundReason: "cancelled"}};
        }
        if (event && event.capacity !== null) {
          const others = await tx.heldSeats(order.eventId, now, order.id);
          const seats = await tx.seatsOfOrder(order.id);
          if (others + seats > event.capacity) {
            await tx.markStatus(order.id, "refunded", {refundedAt: now, refundReason: "oversold"});
            await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.refunded", targetType: "event_order", targetId: order.id, metadata: {reason: "oversold"}});
            return {status: "oversold", order: {...order, status: "refunded", refundedAt: now, refundReason: "oversold"}};
          }
        }
        await tx.markStatus(order.id, "paid", {paidAt: now});
        await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.paid", targetType: "event_order", targetId: order.id, metadata: {}});
        return {status: "paid", order: {...order, status: "paid", paidAt: now}};
      });
    },

    async expireBySession(sessionId: string): Promise<void> {
      await runTransaction(async (tx) => {
        const order = await tx.orderBySessionId(sessionId);
        if (order?.status === "pending") {
          await tx.markStatus(order.id, "expired", {});
          await tx.insertAudit({actorUserId: null, actorType: "system", action: "event.order.expired", targetType: "event_order", targetId: order.id, metadata: {}});
        }
      });
    },

    async heldSeats(eventId: string, now: Date): Promise<number> {
      return runTransaction((tx) => tx.heldSeats(eventId, now));
    },

    async paidSeats(eventId: string): Promise<number> {
      return runTransaction((tx) => tx.paidSeats(eventId));
    },

    /** The localized title the receipt names. Not transactional: a read of one row. */
    async eventSummary(eventId: string, locale: "en" | "zh-HK"): Promise<{title: string; startsAt: Date; slug: string; venue: string | null} | null> {
      return runTransaction(async (tx) => {
        const row = (await tx.eventSummary(eventId))[0];
        if (!row) return null;
        return {title: locale === "zh-HK" ? row.titleZh ?? row.titleEn : row.titleEn, startsAt: row.startsAt, slug: row.slug, venue: row.venue};
      });
    },

    /** The seat count the receipt names; the transaction holds it already. */
    async seatsOfOrder(orderId: string): Promise<number> {
      return runTransaction((tx) => tx.seatsOfOrder(orderId));
    },

    /** One order, for the refund path. */
    async orderById(orderId: string): Promise<OrderRecord | null> {
      return runTransaction((tx) => tx.orderById(orderId));
    },

    /** Every order of an event, for the admin Orders section. */
    async listEventOrders(eventId: string): Promise<readonly EventOrderRow[]> {
      return runTransaction((tx) => tx.listEventOrders(eventId));
    },

    /**
     * The sweep's work list. A query rather than a queue: the predicate is the
     * work, so a missed run catches up and nothing has to be enqueued.
     */
    async ordersAwaitingCancellationRefund(limit: number): Promise<readonly Readonly<{orderId: string; eventId: string}>[]> {
      return runTransaction((tx) => tx.ordersAwaitingCancellationRefund(limit));
    },

    async deferUnsettledCancellationRefund(orderId: string): Promise<void> {
      return runTransaction((tx) => tx.deferUnsettledCancellationRefund(orderId));
    },

    /**
     * The conditional refund commit. `false` means the order was not `paid` when
     * the statement ran, so the caller reports "already refunded" rather than
     * claiming a refund it did not make.
     */
    async refundPaidOrder(orderId: string, input: Readonly<{refundedAt: Date; actorUserId: string | null; actorType: string; refundReason: RefundReason; reason: string; note: string | null}>): Promise<boolean> {
      return runTransaction((tx) => tx.refundPaidOrder(orderId, input));
    },

    async reconcileRefundedOrder(orderId: string, input: RefundReconciliationInput): Promise<boolean> {
      return runTransaction((tx) => tx.reconcileRefundedOrder(orderId, input));
    },

    async markRefundFailed(orderId: string, input: Readonly<{eventId: string; refundId: string; amountHkdCents: number}>): Promise<boolean> {
      return runTransaction((tx) => tx.markRefundFailed(orderId, input));
    },

    /** Each seat of an order, in position order, for the receipt and the passes. */
    async orderSeats(orderId: string): Promise<readonly {seatId: string; position: number; attendeeName: string}[]> {
      return runTransaction((tx) => tx.orderSeats(orderId));
    },

    /** One seat with its order, for a single pass. `null` unless the order is paid. */
    async seatForPass(seatId: string): Promise<Readonly<{seatId: string; attendeeName: string; attendeeEmail: string; eventId: string; buyerLocale: "en" | "zh-HK"; order: OrderRecord}> | null> {
      return runTransaction((tx) => tx.seatForPass(seatId));
    },
  };
}

export const eventOrdersRepository = createEventOrdersRepository();
export type EventOrdersRepository = ReturnType<typeof createEventOrdersRepository>;
