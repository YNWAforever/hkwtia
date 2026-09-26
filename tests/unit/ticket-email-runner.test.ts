import {describe, expect, it, vi} from "vitest";

import {deliverTicketEmailsForOrder, type TicketEmailRunnerDependencies} from "@/lib/billing/ticket-email-runner";
import type {OrderRecord} from "@/lib/db/repos/event-orders";
import type {TicketEmailClaim} from "@/lib/db/repos/ticket-email-outbox";
import {createTestTransport} from "@/lib/email/transport";

const orderId = "33333333-3333-4333-8333-333333333333";
const noticeId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-09-26T04:00:00Z");
const order: OrderRecord = {
  id: orderId, eventId: "55555555-5555-4555-8555-555555555555",
  buyerProfileId: null, buyerName: "Ada", buyerEmail: "ada@example.test",
  buyerLocale: "en", amountHkdCents: 25_000, currency: "hkd", status: "paid",
  stripeCheckoutSessionId: "cs_test", stripeCheckoutUrl: null, idempotencyKey: "checkout-1",
  expiresAt: new Date("2026-09-26T03:00:00Z"), paidAt: now,
  refundedAt: null, refundReason: null,
};

function fixture(claimOverrides: Partial<TicketEmailClaim> = {}, orderOverrides: Partial<OrderRecord> = {}) {
  const claim: TicketEmailClaim = {
    id: noticeId, orderId, seatId: null, kind: "confirmation",
    eventKey: "ticket-confirmation:" + orderId, attemptCount: 1, payload: null,
    ...claimOverrides,
  };
  const transport = createTestTransport();
  const outbox = {
    claimForOrder: vi.fn(async () => [claim]),
    claimDue: vi.fn(async () => [claim]),
    freezePayload: vi.fn(async () => true),
    markSent: vi.fn(async () => true),
    markRetryable: vi.fn(async () => true),
    markBlocked: vi.fn(async () => true),
    markSuppressed: vi.fn(async () => true),
  };
  const orders = {
    orderById: vi.fn(async () => ({...order, ...orderOverrides})),
    eventSummary: vi.fn(async () => ({
      title: "Edge AI for Builders", startsAt: new Date("2026-10-01T10:00:00Z"),
      slug: "edge-ai", venue: "WTIA",
    })),
    orderSeats: vi.fn(async () => [{seatId: "66666666-6666-4666-8666-666666666666", position: 1, attendeeName: "Ada"}]),
    seatsOfOrder: vi.fn(async () => 1),
    seatForPass: vi.fn(async () => null),
  };
  const renderEmail = vi.fn(async () => ({
    subject: "Ticket receipt", html: "<p>Ticket receipt</p>", text: "Ticket receipt", headers: {},
  }));
  const refundVerified = vi.fn(async () => true);
  const dependencies: TicketEmailRunnerDependencies = {
    outbox, orders: orders as unknown as TicketEmailRunnerDependencies["orders"],
    renderEmail, transport, refundVerified, emailFrom: "tickets@wtia.test",
    appUrl: "https://wtia.test", passSecret: "fixture-pass-secret",
  };
  return {claim, dependencies, outbox, orders, renderEmail, transport, refundVerified};
}

describe("ticket email outbox runner", () => {
  it("freezes the rendered receipt before sending and settles the claimed notice", async () => {
    const {dependencies, outbox, renderEmail, transport} = fixture();
    await deliverTicketEmailsForOrder(orderId, dependencies, now);
    expect(outbox.claimForOrder).toHaveBeenCalledWith(orderId, now, 3);
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({
      template: "event_ticket_confirmation", locale: "en", recipientName: "Ada",
    }));
    expect(outbox.freezePayload).toHaveBeenCalledWith(noticeId, 1,
      expect.objectContaining({to: "ada@example.test", idempotencyKey: "ticket-confirmation:" + orderId}), now);
    expect(transport.sends).toHaveLength(1);
    expect(outbox.markSent).toHaveBeenCalledWith(noticeId, 1, "test-email-1");
  });

  it("holds a refund notice until the provider confirms the full refund", async () => {
    const {dependencies, outbox, transport, refundVerified} = fixture(
      {kind: "refund", eventKey: "ticket-refund:" + orderId + ":2026-09-26T04:00:00.000Z"},
      {status: "refunded", refundedAt: now},
    );
    refundVerified.mockResolvedValue(false);
    await deliverTicketEmailsForOrder(orderId, dependencies, now);
    expect(refundVerified).toHaveBeenCalledWith(expect.objectContaining({id: orderId}));
    expect(outbox.markRetryable).toHaveBeenCalledWith(noticeId, 1, now, "refund_pending");
    expect(transport.sends).toEqual([]);
  });
  it("suppresses an unsent receipt after its order was refunded", async () => {
    const {dependencies, outbox, transport} = fixture({}, {status: "refunded"});
    await deliverTicketEmailsForOrder(orderId, dependencies, now);
    expect(outbox.markSuppressed).toHaveBeenCalledWith(noticeId, 1, now);
    expect(transport.sends).toEqual([]);
  });
  it("routes each pass to its attendee with a signed pass link", async () => {
    const seatId = "66666666-6666-4666-8666-666666666666";
    const {dependencies, orders, renderEmail, outbox, transport} = fixture({
      kind: "pass", seatId, eventKey: "ticket-pass:" + seatId + ":2026-09-26T04:00:00.000Z",
    });
    orders.seatForPass.mockResolvedValue({
      seatId, attendeeName: "Bea", attendeeEmail: "bea@example.test",
      eventId: order.eventId, buyerLocale: "en", order,
    } as never);
    await deliverTicketEmailsForOrder(orderId, dependencies, now);
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({
      template: "event_ticket_pass", recipientName: "Bea",
      variables: expect.objectContaining({attendeeName: "Bea", ctaUrl: expect.stringContaining("/pass/")}),
    }));
    expect(outbox.freezePayload).toHaveBeenCalledWith(noticeId, 1,
      expect.objectContaining({to: "bea@example.test", idempotencyKey: "ticket-pass:" + seatId + ":2026-09-26T04:00:00.000Z"}), now);
    expect(transport.sends).toHaveLength(1);
  });

  it("sends a refund failure notice with the contact link", async () => {
    const {dependencies, renderEmail, outbox, transport} = fixture(
      {kind: "refund_failed", eventKey: "ticket-refund-failed:" + orderId + ":evt_1"},
      {status: "refund_failed"},
    );
    await deliverTicketEmailsForOrder(orderId, dependencies, now);
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({
      template: "event_ticket_refund_failed",
      variables: expect.objectContaining({ctaUrl: "https://wtia.test/contact"}),
    }));
    expect(outbox.freezePayload).toHaveBeenCalledWith(noticeId, 1,
      expect.objectContaining({to: "ada@example.test", idempotencyKey: "ticket-refund-failed:" + orderId + ":evt_1"}), now);
    expect(transport.sends).toHaveLength(1);
  });

  it("retries frozen content without reading a changed order or rendering again", async () => {
    const payload = {to: "ada@example.test", from: "tickets@wtia.test", subject: "Original",
      html: "<p>Original</p>", text: "Original", headers: {},
      idempotencyKey: "ticket-confirmation:" + orderId};
    const {dependencies, renderEmail, orders, outbox, transport} = fixture({payload});
    orders.eventSummary.mockRejectedValue(new Error("event temporarily unavailable"));
    await deliverTicketEmailsForOrder(orderId, dependencies, now);
    expect(renderEmail).not.toHaveBeenCalled();
    expect(outbox.freezePayload).not.toHaveBeenCalled();
    expect(transport.sends).toEqual([expect.objectContaining(payload)]);
  });
});
