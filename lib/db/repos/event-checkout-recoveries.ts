import "server-only";

import {sql} from "drizzle-orm";

import {TICKET_RECOVERY_MS} from "@/config/tickets";
import {getDb} from "@/lib/db/repos/common";
import {eventCheckoutRecoveries, eventOrders, eventOrderSeats} from "@/lib/db/server-schema";
import type {TicketRecoveryRecord, TicketRecoveryStore} from "@/lib/tickets/checkout-recovery";

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as {rows: T[]}).rows;
  return [];
}
function date(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new Error("INVALID_RECOVERY_DATE");
  return parsed;
}
function recordFrom(row: Record<string, unknown>): TicketRecoveryRecord {
  return {
    orderId: String(row.orderId), eventId: String(row.eventId),
    buyerProfileId: row.buyerProfileId == null ? null : String(row.buyerProfileId),
    status: String(row.status) as TicketRecoveryRecord["status"],
    seatCount: Number(row.seatCount), amountHkdCents: Number(row.amountHkdCents),
    expiresAt: date(row.expiresAt), recoveryExpiresAt: date(row.recoveryExpiresAt),
    stripeCheckoutSessionId: row.stripeCheckoutSessionId == null ? null : String(row.stripeCheckoutSessionId),
    stripeCheckoutUrl: row.stripeCheckoutUrl == null ? null : String(row.stripeCheckoutUrl),
  };
}
export type IssueTicketRecoveryInput = Readonly<{
  digest: string; eventId: string; idempotencyKey: string; buyerProfileId: string | null; now: Date;
}>;

export const eventCheckoutRecoveriesRepository: TicketRecoveryStore & Readonly<{
  issueForAttempt: (input: IssueTicketRecoveryInput) => Promise<boolean>;
}> = {
  async issueForAttempt(input) {
    if (!/^[a-f0-9]{64}$/.test(input.digest)) return false;
    const db = await getDb();
    return db.transaction(async (tx) => {
      // A token is attached only to the exact pending attempt the checkout core
      // just accepted. Never use a client-supplied key as read authorization.
      const order = rows<{id: string}>(await tx.execute(sql`
        SELECT id FROM ${eventOrders}
        WHERE idempotency_key = ${input.idempotencyKey}
          AND event_id = ${input.eventId}
          AND buyer_profile_id IS NOT DISTINCT FROM ${input.buyerProfileId}
          AND status = 'pending'
        FOR UPDATE
      `))[0];
      if (!order) return false;
      const expiresAt = new Date(input.now.getTime() + TICKET_RECOVERY_MS);
      await tx.execute(sql`
        INSERT INTO ${eventCheckoutRecoveries} (order_id, recovery_digest, expires_at)
        VALUES (${order.id}, ${input.digest}, ${expiresAt})
        ON CONFLICT (order_id) DO UPDATE SET
          recovery_digest = EXCLUDED.recovery_digest,
          expires_at = EXCLUDED.expires_at,
          invalidated_at = NULL
      `);
      return true;
    });
  },
  async read(digest, now) {
    if (!/^[a-f0-9]{64}$/.test(digest)) return null;
    const db = await getDb();
    const row = rows<Record<string, unknown>>(await db.execute(sql`
      SELECT o.id AS "orderId", o.event_id AS "eventId", o.buyer_profile_id AS "buyerProfileId",
             o.status, o.amount_hkd_cents AS "amountHkdCents", o.expires_at AS "expiresAt",
             o.stripe_checkout_session_id AS "stripeCheckoutSessionId", o.stripe_checkout_url AS "stripeCheckoutUrl",
             r.expires_at AS "recoveryExpiresAt", COUNT(s.id)::int AS "seatCount"
      FROM ${eventCheckoutRecoveries} r
      JOIN ${eventOrders} o ON o.id = r.order_id
      LEFT JOIN ${eventOrderSeats} s ON s.order_id = o.id
      WHERE r.recovery_digest = ${digest} AND r.invalidated_at IS NULL AND r.expires_at > ${now}
      GROUP BY r.id, o.id
      LIMIT 1
    `))[0];
    return row ? recordFrom(row) : null;
  },
  async invalidate(digest) {
    const db = await getDb();
    await db.execute(sql`UPDATE ${eventCheckoutRecoveries} SET invalidated_at = NOW() WHERE recovery_digest = ${digest} AND invalidated_at IS NULL`);
  },
};
