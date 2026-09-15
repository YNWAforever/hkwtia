import {describe, expect, it, vi} from "vitest";

import {createEventOrdersRepository, type EventOrdersTransaction, type LockedEvent, type OrderRecord} from "@/lib/db/repos/event-orders";

const now = new Date("2026-09-14T04:00:00Z");
const event: LockedEvent = {id: "ev-1", capacity: 2, published: true, startsAt: new Date("2026-10-01T10:00:00Z"), endsAt: null, registrationMode: "ticketed", ticketPriceHkdCents: 25_000};

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {id: "order-1", eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", amountHkdCents: 25_000, currency: "hkd", status: "pending", stripeCheckoutSessionId: null, stripeCheckoutUrl: null, idempotencyKey: "idem-1", expiresAt: new Date(now.getTime() + 1_800_000), paidAt: null, refundedAt: null, refundReason: null, ...overrides};
}

function transaction(overrides: Partial<EventOrdersTransaction> = {}): EventOrdersTransaction {
  return {
    lockEvent: vi.fn(async () => event),
    orderByIdempotencyKey: vi.fn(async () => null),
    orderBySessionId: vi.fn(async () => null),
    seatsOfOrder: vi.fn(async () => 1),
    heldSeats: vi.fn(async () => 0),
    insertOrder: vi.fn(async () => order()),
    insertSeats: vi.fn(async () => undefined),
    attachSession: vi.fn(async () => undefined),
    markStatus: vi.fn(async () => undefined),
    insertAudit: vi.fn(async () => undefined),
    eventSummary: vi.fn(async () => []),
    ...overrides,
  };
}

const seats = [{name: "Ada", email: "ada@example.test"}];

describe("eventOrdersRepository.createOrder", () => {
  it("writes a pending order and its seats when capacity allows", async () => {
    const tx = transaction();
    const result = await createEventOrdersRepository(async (work) => work(tx)).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now});

    expect(result).toMatchObject({ok: true, reused: false});
    expect(tx.insertOrder).toHaveBeenCalledOnce();
    expect(tx.insertSeats).toHaveBeenCalledWith("order-1", seats);
    expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "event.order.created", targetId: "order-1"}));
  });

  it("refuses an event that does not sell tickets", async () => {
    const tx = transaction({lockEvent: vi.fn(async () => ({...event, registrationMode: "rsvp"}))});
    await expect(createEventOrdersRepository(async (work) => work(tx)).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toEqual({ok: false, reason: "EVENT_NOT_TICKETED"});
    expect(tx.insertOrder).not.toHaveBeenCalled();
  });

  it("refuses an amount the event's own price does not derive", async () => {
    const tx = transaction();
    await expect(createEventOrdersRepository(async (work) => work(tx)).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", idempotencyKey: "idem-1", seats, amountHkdCents: 99_000, now}))
      .resolves.toEqual({ok: false, reason: "AMOUNT_MISMATCH"});
    expect(tx.insertOrder).not.toHaveBeenCalled();
  });

  it("refuses when the held seats plus this order exceed capacity", async () => {
    const tx = transaction({heldSeats: vi.fn(async () => 2)});
    await expect(createEventOrdersRepository(async (work) => work(tx)).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toEqual({ok: false, reason: "SOLD_OUT"});
    expect(tx.insertOrder).not.toHaveBeenCalled();
  });

  it("treats an unlimited event as never sold out", async () => {
    const tx = transaction({lockEvent: vi.fn(async () => ({...event, capacity: null})), heldSeats: vi.fn(async () => 999)});
    await expect(createEventOrdersRepository(async (work) => work(tx)).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toMatchObject({ok: true});
  });

  it("reuses the order a repeated idempotency key names", async () => {
    const tx = transaction({orderByIdempotencyKey: vi.fn(async () => order())});
    await expect(createEventOrdersRepository(async (work) => work(tx)).createOrder({eventId: "ev-1", buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test", buyerLocale: "en", idempotencyKey: "idem-1", seats, amountHkdCents: 25_000, now}))
      .resolves.toMatchObject({ok: true, reused: true});
    expect(tx.insertOrder).not.toHaveBeenCalled();
  });
});

describe("eventOrdersRepository.settlePaid", () => {
  it("marks a pending order paid", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order())});
    await expect(createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now))
      .resolves.toMatchObject({status: "paid"});
    expect(tx.markStatus).toHaveBeenCalledWith("order-1", "paid", expect.objectContaining({paidAt: now}));
    expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "event.order.paid", targetId: "order-1"}));
  });

  it("refunds a payment that arrives after the order expired locally", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order({status: "expired"}))});
    await expect(createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now))
      .resolves.toMatchObject({status: "refund_due", order: expect.objectContaining({status: "refunded", refundReason: "cancelled"})});
    expect(tx.markStatus).toHaveBeenCalledWith("order-1", "refunded", expect.objectContaining({refundReason: "cancelled"}));
    expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "event.order.refunded", targetId: "order-1", metadata: {reason: "late_payment"}}));
  });

  it("is a no-op for an order already paid", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order({status: "paid"}))});
    await expect(createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now)).resolves.toMatchObject({status: "duplicate"});
    expect(tx.markStatus).not.toHaveBeenCalled();
  });

  it.each(["oversold", "cancelled"] as const)("re-issues a refund committed as %s but not finished", async (refundReason) => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order({status: "refunded", refundReason}))});
    await expect(createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now))
      .resolves.toMatchObject({status: "refund_due", order: expect.objectContaining({status: "refunded", refundReason})});
    expect(tx.markStatus).not.toHaveBeenCalled();
  });

  it("leaves a staff refund to the staff lane", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order({status: "refunded", refundReason: "staff"}))});
    await expect(createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now)).resolves.toMatchObject({status: "ignored"});
    expect(tx.markStatus).not.toHaveBeenCalled();
  });

  it("refunds an order that lost the race for the last seat", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order()), heldSeats: vi.fn(async () => 2)});
    await expect(createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now)).resolves.toMatchObject({status: "oversold"});
    expect(tx.markStatus).toHaveBeenCalledWith("order-1", "refunded", expect.objectContaining({refundReason: "oversold"}));
    expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "event.order.refunded", targetId: "order-1", metadata: {reason: "oversold"}}));
  });

  it("does not count the order's own seats against it", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order()), heldSeats: vi.fn(async () => 0)});
    await createEventOrdersRepository(async (work) => work(tx)).settlePaid("cs_1", now);
    expect(tx.heldSeats).toHaveBeenCalledWith("ev-1", now, "order-1");
  });
});

describe("eventOrdersRepository.expireBySession", () => {
  it("expires a pending order and writes the audit row", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order())});
    await createEventOrdersRepository(async (work) => work(tx)).expireBySession("cs_1");
    expect(tx.markStatus).toHaveBeenCalledWith("order-1", "expired", {});
    expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "event.order.expired", targetId: "order-1"}));
  });

  it("leaves an order that is no longer pending alone", async () => {
    const tx = transaction({orderBySessionId: vi.fn(async () => order({status: "paid"}))});
    await createEventOrdersRepository(async (work) => work(tx)).expireBySession("cs_1");
    expect(tx.markStatus).not.toHaveBeenCalled();
    expect(tx.insertAudit).not.toHaveBeenCalled();
  });
});
