// @vitest-environment node
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/common")>()),
  getDb: async () => state.database,
}));
import { eventOrdersRepository } from "@/lib/db/repos/event-orders";
import { ticketCheckInRepository } from "@/lib/db/repos/ticket-check-in";
import { ANONYMOUS_ACTOR } from "@/lib/membership/lifecycle";
import { systemActor } from "@/lib/auth/authorize";
import { processRefundSuccess } from "@/lib/billing/refund-success";
import { processRefundFailure } from "@/lib/billing/refund-failure";
import { deliverTicketEmailsForOrder } from "@/lib/billing/ticket-email-runner";
import { ticketEmailOutboxRepository } from "@/lib/db/repos/ticket-email-outbox";
import { createTestTransport } from "@/lib/email/transport";
const staff = {
  kind: "staff",
  profileId: "t16-staff-profile",
  userId: "t16-auth-identity",
} as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
const now = new Date();
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "full ticket lifecycle actual PostgreSQL",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
      state.database = f.database;
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES ($1,$2,'Synthetic Staff','staff')",
        [staff.profileId, staff.userId],
      );
    }, 120000);
    afterAll(async () => {
      if (f) await f.close();
    });
    async function purchase(capacity = 1) {
      const eventId = randomUUID();
      await f.pool.query(
        "INSERT INTO events(id,slug,title_en,description_en,starts_at,published,status,registration_mode,ticket_price_hkd_cents,capacity,visibility) VALUES($1,$2,'Synthetic Ticket','Synthetic','2030-12-31',true,'published','ticketed',1000,$3,'public')",
        [eventId, "synthetic-ticket-" + eventId, capacity],
      );
      const input = {
        actor: ANONYMOUS_ACTOR,
        eventId,
        buyerProfileId: null,
        buyerName: "Synthetic Buyer",
        buyerEmail: "buyer@example.test",
        buyerLocale: "en" as const,
        idempotencyKey: randomUUID(),
        seats: [{ name: "Synthetic Seat", email: "seat@example.test" }],
        amountHkdCents: 1000,
        now,
      };
      const created = await eventOrdersRepository.createOrder(input);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error("SYNTHETIC_ORDER_NOT_CREATED");
      const session = "cs_test_sql_" + randomUUID();
      expect(
        await eventOrdersRepository.attachSession(
          created.order.id,
          session,
          "https://checkout.stripe.com/test",
        ),
      ).toBe(true);
      const seats = await eventOrdersRepository.orderSeats(created.order.id);
      return {
        input,
        eventId,
        orderId: created.order.id,
        seatId: seats[0]!.seatId,
        session,
      };
    }
    it("keeps late-payment refund unverified until a succeeded provider reconciliation", async () => {
      const x = await purchase();
      expect(await eventOrdersRepository.expireBySession(x.session, x.orderId)).toBe(true);
      expect(
        (await eventOrdersRepository.settlePaid(x.session, now, {orderId: x.orderId, amountHkdCents: 1000, currency: "hkd"})).status,
      ).toBe("refund_due");
      const row = (
        await f.pool.query(
          "SELECT status,refunded_at FROM event_orders WHERE id=$1",
          [x.orderId],
        )
      ).rows[0];
      expect(row).toEqual({ status: "refund_pending", refunded_at: null });
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='event.order.refunded'",
            [x.orderId],
          )
        ).rows[0].n,
      ).toBe(0);
    });
    it("records check-in against application profile rather than external Auth identity", async () => {
      const x = await purchase();
      await eventOrdersRepository.settlePaid(x.session, now, {orderId: x.orderId, amountHkdCents: 1000, currency: "hkd"});
      await expect(
        ticketCheckInRepository.checkInSeat(staff, { seatId: x.seatId }),
      ).resolves.toEqual({ disposition: "checked_in" });
      expect(
        (
          await f.pool.query(
            "SELECT actor_user_id FROM audit_events WHERE target_id=$1 AND action='event.seat.checked_in'",
            [x.seatId],
          )
        ).rows,
      ).toEqual([{ actor_user_id: staff.profileId }]);
    });
    it("serializes admission against an in-flight refund on the same order", async () => {
      const x = await purchase();
      await eventOrdersRepository.settlePaid(x.session, now, {orderId: x.orderId, amountHkdCents: 1000, currency: "hkd"});
      const connection = await f.pool.connect();
      let finished = false;
      await connection.query("BEGIN");
      await connection.query(
        "SELECT id FROM event_orders WHERE id=$1 FOR UPDATE",
        [x.orderId],
      );
      const scan = ticketCheckInRepository
        .checkInSeat(
          { ...staff, userId: staff.profileId },
          { seatId: x.seatId },
        )
        .then((result) => {
          finished = true;
          return result;
        });
      try {
        const pid = (await connection.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid;
        let waiting = false;
        for (let attempt = 0; attempt < 60 && !finished; attempt++) {
          waiting =
            (
              await f.pool.query(
                "SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",
                [pid],
              )
            ).rows[0].n > 0;
          if (waiting) break;
          await delay(25);
        }
        expect(
          waiting,
          "actual PostgreSQL waiter is blocked by this refund connection",
        ).toBe(true);
        expect(finished, "admission waits for the refund order lock").toBe(
          false,
        );
        await connection.query(
          "UPDATE event_orders SET status='refunded',refunded_at=now(),refund_reason='staff' WHERE id=$1",
          [x.orderId],
        );
        await connection.query("COMMIT");
        expect(await scan).toEqual({ disposition: "not_admissible" });
        expect(
          (
            await f.pool.query(
              "SELECT checked_in_at FROM event_order_seats WHERE id=$1",
              [x.seatId],
            )
          ).rows[0].checked_in_at,
        ).toBeNull();
      } finally {
        await connection.query("ROLLBACK");
        connection.release();
        await scan;
      }
    });
    function providerPorts(
      x: Awaited<ReturnType<typeof purchase>>,
      verified: boolean,
    ) {
      return {
        paymentIntentForSession: async () => "pi_test_sql_" + x.orderId,
        ticketOrderIdForPaymentIntent: async () => x.orderId,
        fullyRefundedPaymentIntent: async () => verified,
      };
    }
    function refundCommand(x: Awaited<ReturnType<typeof purchase>>) {
      return {
        eventId: "evt_test_sql_" + randomUUID(),
        refundId: "re_test_sql_" + randomUUID(),
        paymentIntentId: "pi_test_sql_" + x.orderId,
        orderId: x.orderId,
        amountHkdCents: 1000,
        refundReason: "cancelled" as const,
      };
    }
    function emailPorts(verified: boolean) {
      const transport = createTestTransport();
      return {
        outbox: ticketEmailOutboxRepository,
        orders: eventOrdersRepository,
        renderEmail: async () => ({
          subject: "Synthetic notice",
          html: "<p>Synthetic notice</p>",
          text: "Synthetic notice",
          headers: {},
        }),
        transport,
        refundVerified: async () => verified,
        emailFrom: "tickets@example.test",
        appUrl: "http://localhost:3450",
        passSecret: "synthetic-test-pass-secret",
      };
    }
    it("admits exactly one concurrent last-seat purchase and materializes payment once on replay", async () => {
      const x = await purchase();
      await eventOrdersRepository.expireBySession(x.session, x.orderId);
      const results = await Promise.all(
        [1, 2].map((i) =>
          eventOrdersRepository.createOrder({
            ...x.input,
            idempotencyKey: randomUUID(),
            buyerName: "Synthetic " + i,
          }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        { ok: false, reason: "SOLD_OUT" },
      ]);
      const winner = results.find((r) => r.ok)!;
      if (!winner.ok) throw new Error("LAST_SEAT_MISSING");
      const session = "cs_test_sql_" + randomUUID();
      await eventOrdersRepository.attachSession(
        winner.order.id,
        session,
        "https://checkout.stripe.com/test",
      );
      const settlements = await Promise.all([
        eventOrdersRepository.settlePaid(session, now, {orderId: winner.order.id, amountHkdCents: 1000, currency: "hkd"}),
        eventOrdersRepository.settlePaid(session, now, {orderId: winner.order.id, amountHkdCents: 1000, currency: "hkd"}),
      ]);
      expect(settlements.map((s) => s.status).sort()).toEqual([
        "duplicate",
        "paid",
      ]);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='event.order.paid'",
            [winner.order.id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await f.pool.query(
            "SELECT kind FROM ticket_email_outbox WHERE order_id=$1 ORDER BY kind",
            [winner.order.id],
          )
        ).rows,
      ).toEqual([{ kind: "confirmation" }, { kind: "pass" }]);
    });
    it("checks wrong-event pass scope, scan replay and undo against actual persisted seats", async () => {
      const x = await purchase();
      await eventOrdersRepository.settlePaid(x.session, now, {orderId: x.orderId, amountHkdCents: 1000, currency: "hkd"});
      expect(
        await ticketCheckInRepository.passForSeat({
          seatId: x.seatId,
          eventId: randomUUID(),
        }),
      ).toEqual({ status: "unavailable" });
      expect(
        await ticketCheckInRepository.checkInSeat(staff, { seatId: x.seatId }),
      ).toEqual({ disposition: "checked_in" });
      expect(
        await ticketCheckInRepository.checkInSeat(staff, { seatId: x.seatId }),
      ).toEqual({ disposition: "already_checked_in" });
      expect(
        await ticketCheckInRepository.undoSeatCheckIn(staff, {
          seatId: x.seatId,
        }),
      ).toEqual({ disposition: "undone" });
      expect(
        (
          await f.pool.query(
            "SELECT actor_user_id,action FROM audit_events WHERE target_id=$1 ORDER BY created_at",
            [x.seatId],
          )
        ).rows,
      ).toEqual([
        { actor_user_id: staff.profileId, action: "event.seat.checked_in" },
        {
          actor_user_id: staff.profileId,
          action: "event.seat.check_in_reversed",
        },
      ]);
    });
    it("keeps unknown refund uncommitted, then correlates succeeded callback once and ignores stale failure", async () => {
      const x = await purchase();
      await eventOrdersRepository.expireBySession(x.session, x.orderId);
      await eventOrdersRepository.settlePaid(x.session, now, {orderId: x.orderId, amountHkdCents: 1000, currency: "hkd"});
      const command = refundCommand(x),
        sendRefundEmail = vi.fn(async () => undefined),
        deps = {
          orders: eventOrdersRepository,
          stripe: providerPorts(x, false),
          sendRefundEmail,
          now: () => new Date(),
        };
      await expect(
        processRefundSuccess(systemActor("stripe-webhook"), command, deps),
      ).rejects.toThrow("STRIPE_REFUND_NOT_SUCCEEDED");
      expect((await eventOrdersRepository.orderById(x.orderId))?.status).toBe(
        "refund_pending",
      );
      expect(sendRefundEmail).not.toHaveBeenCalled();
      const verified = { ...deps, stripe: providerPorts(x, true) };
      expect(
        await processRefundSuccess(
          systemActor("stripe-webhook"),
          command,
          verified,
        ),
      ).toBe("processed");
      expect(
        await processRefundSuccess(
          systemActor("stripe-webhook"),
          command,
          verified,
        ),
      ).toBe("duplicate");
      expect(
        await processRefundFailure(systemActor("stripe-webhook"), command, {
          ...verified,
          sendFailureEmail: vi.fn(async () => undefined),
        }),
      ).toBe("processed");
      expect((await eventOrdersRepository.orderById(x.orderId))?.status).toBe(
        "refunded",
      );
      expect(
        await eventOrdersRepository.resendEligible(x.seatId, new Date()),
      ).toBe(false);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='event.order.refunded'",
            [x.orderId],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM ticket_email_outbox WHERE order_id=$1 AND kind='refund'",
            [x.orderId],
          )
        ).rows[0].n,
      ).toBe(1);
    });
    it("recovers an unattempted suppressed refund intent once after a failed callback", async () => {
      const x = await purchase();
      await eventOrdersRepository.expireBySession(x.session, x.orderId);
      await eventOrdersRepository.settlePaid(x.session, now, {orderId: x.orderId, amountHkdCents: 1000, currency: "hkd"});
      const command = refundCommand(x),
        failure = {
          orders: eventOrdersRepository,
          stripe: providerPorts(x, false),
          sendFailureEmail: vi.fn(async () => undefined),
        };
      expect(
        await processRefundFailure(
          systemActor("stripe-webhook"),
          command,
          failure,
        ),
      ).toBe("processed");
      expect(
        await processRefundFailure(
          systemActor("stripe-webhook"),
          command,
          failure,
        ),
      ).toBe("duplicate");
      const email = emailPorts(false);
      await deliverTicketEmailsForOrder(
        x.orderId,
        email,
        new Date(Date.now() + 10000),
      );
      expect(email.transport.sends).toHaveLength(1);
      expect(
        (
          await f.pool.query(
            "SELECT status FROM ticket_email_outbox WHERE order_id=$1 AND kind='refund'",
            [x.orderId],
          )
        ).rows,
      ).toEqual([{ status: "suppressed" }]);
      expect(
        await processRefundSuccess(systemActor("stripe-webhook"), command, {
          orders: eventOrdersRepository,
          stripe: providerPorts(x, true),
          sendRefundEmail: vi.fn(async () => undefined),
          now: () => new Date(),
        }),
      ).toBe("processed");
      await deliverTicketEmailsForOrder(
        x.orderId,
        { ...email, refundVerified: async () => true },
        new Date(Date.now() + 20000),
      );
      expect(email.transport.sends).toHaveLength(2);
      await deliverTicketEmailsForOrder(
        x.orderId,
        { ...email, refundVerified: async () => true },
        new Date(Date.now() + 30000),
      );
      expect(email.transport.sends).toHaveLength(2);
      expect(
        (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM ticket_email_outbox WHERE order_id=$1 AND kind='refund'",
            [x.orderId],
          )
        ).rows[0].n,
      ).toBe(1);
    });
  },
);
