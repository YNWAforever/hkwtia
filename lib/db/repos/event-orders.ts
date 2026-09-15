import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {TICKET_HOLD_MS} from "@/config/tickets";
import {getDb} from "@/lib/db/repos/common";
import {auditEvents, eventOrderSeats, eventOrders, events} from "@/lib/db/server-schema";

export type OrderStatus = "pending" | "paid" | "expired" | "failed" | "refunded";
export type RefundReason = "oversold" | "staff" | "cancelled";

export type OrderRecord = Readonly<{
  id: string; eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  buyerLocale: "en" | "zh-HK";
  amountHkdCents: number; currency: string; status: OrderStatus; stripeCheckoutSessionId: string | null;
  stripeCheckoutUrl: string | null;
  idempotencyKey: string; expiresAt: Date; paidAt: Date | null; refundedAt: Date | null; refundReason: RefundReason | null;
}>;

export type LockedEvent = Readonly<{
  id: string; capacity: number | null; published: boolean; startsAt: Date; endsAt: Date | null;
  registrationMode: string; ticketPriceHkdCents: number | null;
}>;

export type SeatInput = Readonly<{name: string; email: string}>;

export type CreateOrderInput = Readonly<{
  eventId: string; buyerProfileId: string | null; buyerName: string; buyerEmail: string;
  buyerLocale: "en" | "zh-HK";
  idempotencyKey: string; seats: readonly SeatInput[]; amountHkdCents: number; now: Date;
}>;

export type CreateOrderResult =
  | Readonly<{ok: true; order: OrderRecord; reused: boolean}>
  | Readonly<{ok: false; reason: "EVENT_NOT_FOUND" | "SOLD_OUT"}>;

export type SettleResult =
  | Readonly<{status: "paid" | "duplicate" | "ignored" | "oversold" | "unknown"; order: OrderRecord | null}>;

export type EventOrdersTransaction = Readonly<{
  lockEvent: (eventId: string) => Promise<LockedEvent | null>;
  orderByIdempotencyKey: (key: string) => Promise<OrderRecord | null>;
  orderBySessionId: (sessionId: string) => Promise<OrderRecord | null>;
  seatsOfOrder: (orderId: string) => Promise<number>;
  /** Seats of paid orders, or of pending ones whose hold has not lapsed. */
  heldSeats: (eventId: string, now: Date, excludingOrderId?: string) => Promise<number>;
  insertOrder: (input: CreateOrderInput & {expiresAt: Date; status: "pending"}) => Promise<OrderRecord>;
  insertSeats: (orderId: string, seats: readonly SeatInput[]) => Promise<void>;
  attachSession: (orderId: string, sessionId: string, url: string) => Promise<void>;
  markStatus: (orderId: string, status: OrderStatus, patch: Readonly<{paidAt?: Date; refundedAt?: Date; refundReason?: RefundReason}>) => Promise<void>;
  insertAudit: (input: Readonly<{actorUserId: string | null; actorType: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>}>) => Promise<void>;
  eventSummary: (eventId: string) => Promise<readonly Readonly<{titleEn: string; titleZh: string | null; startsAt: Date; slug: string}>[]>;
}>;

const seatSchema = z.object({name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().pipe(z.string().email().max(320))}).strict();
export const ticketSeatsSchema = z.array(seatSchema).min(1);

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

async function defaultTransaction<T>(work: (tx: EventOrdersTransaction) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => work({
    lockEvent: async (eventId) => rows<LockedEvent>(await tx.execute(sql`
      SELECT id, capacity, published, starts_at AS "startsAt", ends_at AS "endsAt",
             registration_mode AS "registrationMode", ticket_price_hkd_cents AS "ticketPriceHkdCents"
      FROM ${events} WHERE id = ${eventId} FOR UPDATE
    `))[0] ?? null,
    orderByIdempotencyKey: async (key) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE idempotency_key = ${key} LIMIT 1`))[0];
      return row ? orderFrom(row) : null;
    },
    orderBySessionId: async (sessionId) => {
      const row = rows<Record<string, unknown>>(await tx.execute(sql`SELECT * FROM ${eventOrders} WHERE stripe_checkout_session_id = ${sessionId} LIMIT 1 FOR UPDATE`))[0];
      return row ? orderFrom(row) : null;
    },
    seatsOfOrder: async (orderId) => Number(rows<{value: number}>(await tx.execute(sql`SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} WHERE order_id = ${orderId}`))[0]?.value ?? 0),
    heldSeats: async (eventId, now, excludingOrderId) => Number(rows<{value: number}>(await tx.execute(sql`
      SELECT COUNT(*)::int AS value FROM ${eventOrderSeats} AS s
      JOIN ${eventOrders} AS o ON o.id = s.order_id
      WHERE o.event_id = ${eventId}
        AND (${excludingOrderId === undefined ? sql`TRUE` : sql`o.id <> ${excludingOrderId}`})
        AND (o.status = 'paid' OR (o.status = 'pending' AND o.expires_at > ${now}))
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
    markStatus: async (orderId, status, patch) => { await tx.execute(sql`UPDATE ${eventOrders} SET status = ${status}, paid_at = ${patch.paidAt ?? null}, refunded_at = ${patch.refundedAt ?? null}, refund_reason = ${patch.refundReason ?? null}, updated_at = NOW() WHERE id = ${orderId}`); },
    insertAudit: async (input) => { await tx.execute(sql`INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES (${input.actorUserId}, ${input.actorType}, ${input.action}, ${input.targetType}, ${input.targetId}, ${JSON.stringify(input.metadata)}::jsonb)`); },
    eventSummary: async (eventId) => rows<{titleEn: string; titleZh: string | null; startsAt: Date; slug: string}>(await tx.execute(sql`
      SELECT title_en AS "titleEn", title_zh AS "titleZh", starts_at AS "startsAt", slug FROM ${events} WHERE id = ${eventId} LIMIT 1
    `)),
  }));
}

export function createEventOrdersRepository(runTransaction: <T>(work: (tx: EventOrdersTransaction) => Promise<T>) => Promise<T> = defaultTransaction) {
  return {
    async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
      return runTransaction(async (tx) => {
        const event = await tx.lockEvent(input.eventId);
        if (!event) return {ok: false, reason: "EVENT_NOT_FOUND"};
        const existing = await tx.orderByIdempotencyKey(input.idempotencyKey);
        if (existing) return {ok: true, order: existing, reused: true};
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
        if (order.status !== "pending") return {status: "ignored", order};
        const event = await tx.lockEvent(order.eventId);
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

    /** The localized title the receipt names. Not transactional: a read of one row. */
    async eventSummary(eventId: string, locale: "en" | "zh-HK"): Promise<{title: string; startsAt: Date; slug: string} | null> {
      return runTransaction(async (tx) => {
        const row = (await tx.eventSummary(eventId))[0];
        if (!row) return null;
        return {title: locale === "zh-HK" ? row.titleZh ?? row.titleEn : row.titleEn, startsAt: row.startsAt, slug: row.slug};
      });
    },

    /** The seat count the receipt names; the transaction holds it already. */
    async seatsOfOrder(orderId: string): Promise<number> {
      return runTransaction((tx) => tx.seatsOfOrder(orderId));
    },
  };
}

export const eventOrdersRepository = createEventOrdersRepository();
export type EventOrdersRepository = ReturnType<typeof createEventOrdersRepository>;
