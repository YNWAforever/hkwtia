import {describe, expect, it, vi} from "vitest";
import type Stripe from "stripe";

import {systemActor} from "@/lib/auth/authorize";
import type {OrderRecord, SettleResult} from "@/lib/db/repos/event-orders";
import {renderEmail, type RenderEmailInput} from "@/lib/email/render";
import {createTestTransport} from "@/lib/email/transport";
import {
  createTicketProcessor,
  type TicketProcessorDependencies,
} from "@/lib/billing/ticket-webhook-processor";
import {
  processStripeEvent,
  type TicketProcessor,
  type TicketWebhookCommand,
  type WebhookLifecycleCommand,
  type WebhookProcessor,
} from "@/lib/billing/webhook-service";
import {checkoutCompleted, membershipId} from "@/tests/fixtures/stripe-events";

const orderId = "33333333-3333-4333-8333-333333333333";
const eventId = "ev_ticket_event";
const sessionId = "cs_ticket_1";
const paymentIntentId = "pi_ticket_1";

const pendingOrder: OrderRecord = {
  id: orderId,
  eventId,
  buyerProfileId: null,
  buyerName: "Ada",
  buyerEmail: "ada@example.test",
  buyerLocale: "en",
  amountHkdCents: 25_000,
  currency: "hkd",
  status: "pending",
  stripeCheckoutSessionId: sessionId,
  stripeCheckoutUrl: null,
  idempotencyKey: "idem-1",
  expiresAt: new Date("2026-09-14T04:00:00Z"),
  paidAt: null,
  refundedAt: null,
  refundReason: null,
};

const eventSummary = {
  title: "Edge AI for Builders",
  startsAt: new Date("2026-10-01T10:00:00Z"),
  slug: "edge-ai-for-builders",
  venue: "KOHO, Kwun Tong",
};

type TicketEventType = "checkout.session.completed" | "checkout.session.async_payment_succeeded" | "checkout.session.expired";

function ticketEvent(type: TicketEventType, id = "evt_ticket", overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id,
    type,
    created: 1_784_156_400,
    data: {
      object: {
        id: sessionId,
        client_reference_id: orderId,
        payment_intent: paymentIntentId,
        // Stripe sends `paid` on a settled session; the ticket lane must refuse
        // `unpaid` with a delayed-notification payment method.
        payment_status: "paid",
        metadata: {kind: "event_ticket", orderId},
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

function captureMembershipProcessor() {
  const commands: WebhookLifecycleCommand[] = [];
  const processor: WebhookProcessor = {
    async process(_actor, command) {
      commands.push(command);
      return "processed";
    },
  };
  return {commands, processor};
}

function captureTicketProcessor() {
  const commands: TicketWebhookCommand[] = [];
  const processor: TicketProcessor = {
    async process(_actor, command) {
      commands.push(command);
      return "processed";
    },
  };
  return {commands, processor};
}

function buildTicketProcessor(options: {
  settle?: SettleResult;
  seats?: number;
  summary?: {title: string; startsAt: Date; slug: string; venue: string | null} | null;
  orderSeats?: readonly {seatId: string; position: number; attendeeName: string}[];
} = {}) {
  const orders = {
    settlePaid: vi.fn(async (): Promise<SettleResult> => options.settle ?? {status: "paid", order: pendingOrder}),
    expireBySession: vi.fn(async () => undefined),
    eventSummary: vi.fn(async () => (options.summary === undefined ? eventSummary : options.summary)),
    seatsOfOrder: vi.fn(async () => options.seats ?? 2),
    orderSeats: vi.fn(async () => options.orderSeats ?? []),
    seatForPass: vi.fn(async () => null),
  };
  const refundPaymentIntent = vi.fn(async () => undefined);
  // The real renderer runs behind the spy, so a missing placeholder throws and
  // the send is skipped — the same silence production would see.
  const renderEmailSpy = vi.fn(renderEmail);
  const transport = createTestTransport();
  const dependencies: TicketProcessorDependencies = {
    orders: orders as unknown as TicketProcessorDependencies["orders"],
    refundPaymentIntent,
    email: {
      renderEmail: renderEmailSpy as unknown as typeof renderEmail,
      transport,
      emailFrom: "tickets@wtia.test",
    },
    appUrl: "https://w.test",
    passSecret: "pass-secret-fixture",
    now: () => new Date("2026-09-14T04:00:00Z"),
  };
  return {
    processor: createTicketProcessor(dependencies),
    orders,
    refundPaymentIntent,
    renderEmail: renderEmailSpy,
    transport,
  };
}

function command(eventType: TicketWebhookCommand["eventType"]): TicketWebhookCommand {
  return {eventId: "evt_ticket", eventType, orderId, checkoutSessionId: sessionId, paymentIntentId};
}

describe("processStripeEvent ticket branch", () => {
  it("dispatches a completed ticket session to the ticket processor and never the membership processor", async () => {
    const membership = captureMembershipProcessor();
    const ticket = captureTicketProcessor();

    await expect(
      processStripeEvent(ticketEvent("checkout.session.completed"), systemActor("stripe-webhook"), membership.processor, ticket.processor),
    ).resolves.toBe("processed");

    expect(membership.commands).toEqual([]);
    expect(ticket.commands).toEqual([{
      eventId: "evt_ticket",
      eventType: "checkout.session.completed",
      orderId,
      checkoutSessionId: sessionId,
      paymentIntentId,
    }]);
  });

  it("still routes a membership event through the membership processor unchanged", async () => {
    const membership = captureMembershipProcessor();
    const ticket = captureTicketProcessor();

    await expect(
      processStripeEvent(checkoutCompleted(), systemActor("stripe-webhook"), membership.processor, ticket.processor),
    ).resolves.toBe("processed");

    expect(ticket.commands).toEqual([]);
    expect(membership.commands).toHaveLength(1);
    expect(membership.commands[0]).toMatchObject({eventType: "checkout.session.completed", membershipId});
  });

  it("returns processed for an unrecognised event type without invoking either processor", async () => {
    const membership = captureMembershipProcessor();
    const ticket = captureTicketProcessor();
    const unrecognised = {id: "evt_other", type: "payment_intent.created", created: 1, data: {object: {id: "pi_1"}}} as unknown as Stripe.Event;

    await expect(
      processStripeEvent(unrecognised, systemActor("stripe-webhook"), membership.processor, ticket.processor),
    ).resolves.toBe("processed");

    expect(membership.commands).toEqual([]);
    expect(ticket.commands).toEqual([]);
  });

  it("refuses an event_ticket whose client reference does not match the order", async () => {
    const membership = captureMembershipProcessor();
    const ticket = captureTicketProcessor();

    await expect(
      processStripeEvent(
        ticketEvent("checkout.session.completed", "evt_mismatch", {client_reference_id: "44444444-4444-4444-8444-444444444444"}),
        systemActor("stripe-webhook"),
        membership.processor,
        ticket.processor,
      ),
    ).rejects.toMatchObject({code: "INVALID_WEBHOOK_EVENT"});

    expect(membership.commands).toEqual([]);
    expect(ticket.commands).toEqual([]);
  });

  it("does not settle a completed ticket session that Stripe reports as unpaid", async () => {
    const {processor, orders, refundPaymentIntent, transport} = buildTicketProcessor();

    await expect(
      processStripeEvent(
        ticketEvent("checkout.session.completed", "evt_unpaid", {payment_status: "unpaid"}),
        systemActor("stripe-webhook"),
        captureMembershipProcessor().processor,
        processor,
      ),
    ).rejects.toMatchObject({code: "INVALID_WEBHOOK_EVENT"});

    expect(orders.settlePaid).not.toHaveBeenCalled();
    expect(refundPaymentIntent).not.toHaveBeenCalled();
    expect(transport.sends).toEqual([]);
  });

  it("settles a paid async_payment_succeeded exactly like a completed session", async () => {
    const {processor, orders, transport} = buildTicketProcessor({settle: {status: "paid", order: {...pendingOrder, status: "paid"}}});
    const membership = captureMembershipProcessor();

    await expect(
      processStripeEvent(ticketEvent("checkout.session.async_payment_succeeded"), systemActor("stripe-webhook"), membership.processor, processor),
    ).resolves.toBe("processed");

    expect(membership.commands).toEqual([]);
    expect(orders.settlePaid).toHaveBeenCalledWith(sessionId, expect.any(Date));
    expect(transport.sends).toHaveLength(1);
  });

  it("normalises an async_payment_succeeded to the completed event type", async () => {
    const ticket = captureTicketProcessor();

    await expect(
      processStripeEvent(ticketEvent("checkout.session.async_payment_succeeded"), systemActor("stripe-webhook"), captureMembershipProcessor().processor, ticket.processor),
    ).resolves.toBe("processed");

    expect(ticket.commands).toEqual([{
      eventId: "evt_ticket",
      eventType: "checkout.session.completed",
      orderId,
      checkoutSessionId: sessionId,
      paymentIntentId,
    }]);
  });
});

describe("createTicketProcessor", () => {
  it("expires the order for a checkout.session.expired and sends nothing", async () => {
    const {processor, orders, refundPaymentIntent, transport} = buildTicketProcessor();

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.expired"))).resolves.toBe("processed");

    expect(orders.expireBySession).toHaveBeenCalledWith(sessionId);
    expect(orders.settlePaid).not.toHaveBeenCalled();
    expect(refundPaymentIntent).not.toHaveBeenCalled();
    expect(transport.sends).toEqual([]);
  });

  it.each(["oversold", "refund_due"] as const)("refunds the whole charge and emails the buyer when the settlement is %s", async (status) => {
    const {processor, refundPaymentIntent, renderEmail, transport} = buildTicketProcessor({
      settle: {status, order: {...pendingOrder, status: "refunded"}},
    });

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");

    expect(refundPaymentIntent).toHaveBeenCalledWith(paymentIntentId, `ticket-refund:${orderId}`);
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({template: "event_ticket_refunded", locale: "en", recipientName: "Ada"}));
    expect(transport.sends).toHaveLength(1);
  });

  it("re-issues the refund on redelivery when the first provider call threw, with the same idempotency key", async () => {
    const orders = {
      settlePaid: vi.fn()
        .mockResolvedValueOnce({status: "oversold", order: {...pendingOrder, status: "refunded", refundReason: "oversold"}} as SettleResult)
        .mockResolvedValueOnce({status: "refund_due", order: {...pendingOrder, status: "refunded", refundReason: "oversold"}} as SettleResult),
      expireBySession: vi.fn(async () => undefined),
      eventSummary: vi.fn(async () => eventSummary),
      seatsOfOrder: vi.fn(async () => 2),
      orderSeats: vi.fn(async () => []),
      seatForPass: vi.fn(async () => null),
    };
    const refundPaymentIntent = vi.fn()
      .mockRejectedValueOnce(new Error("stripe unavailable"))
      .mockResolvedValue(undefined);
    const transport = createTestTransport();
    const processor = createTicketProcessor({
      orders: orders as unknown as TicketProcessorDependencies["orders"],
      refundPaymentIntent,
      email: {renderEmail, transport, emailFrom: "tickets@wtia.test"},
      appUrl: "https://w.test",
      passSecret: "pass-secret-fixture",
      now: () => new Date("2026-09-14T04:00:00Z"),
    });

    // First delivery: the settlement commits the refund, the provider call throws,
    // and the throw must reach the route so Stripe redelivers.
    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).rejects.toThrow("stripe unavailable");
    // Redelivery: the repository answers `refund_due`, the refund is re-issued and
    // the email is sent.
    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");

    expect(refundPaymentIntent).toHaveBeenCalledTimes(2);
    expect(refundPaymentIntent.mock.calls[0]![1]).toBe(`ticket-refund:${orderId}`);
    expect(refundPaymentIntent.mock.calls[1]![1]).toBe(`ticket-refund:${orderId}`);
    expect(transport.sends).toHaveLength(1);
  });

  it("sends no refund email when there is no payment intent to refund", async () => {
    const {processor, refundPaymentIntent, transport} = buildTicketProcessor({
      settle: {status: "oversold", order: {...pendingOrder, status: "refunded", refundReason: "oversold"}},
    });

    await expect(
      processor.process(systemActor("stripe-webhook"), {...command("checkout.session.completed"), paymentIntentId: null}),
    ).resolves.toBe("processed");

    expect(refundPaymentIntent).not.toHaveBeenCalled();
    expect(transport.sends).toEqual([]);
  });

  it("sends the confirmation email when the settlement is paid", async () => {
    const {processor, refundPaymentIntent, renderEmail, transport} = buildTicketProcessor({
      settle: {status: "paid", order: {...pendingOrder, status: "paid"}},
    });

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");

    expect(refundPaymentIntent).not.toHaveBeenCalled();
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({template: "event_ticket_confirmation", locale: "en"}));
    expect(transport.sends).toHaveLength(1);
  });

  it("supplies every placeholder the confirmation copy uses", async () => {
    const {processor, renderEmail, transport} = buildTicketProcessor({
      settle: {status: "paid", order: {...pendingOrder, status: "paid"}},
      seats: 3,
    });

    await processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"));

    const input = (renderEmail.mock.calls[0] as unknown as [RenderEmailInput])[0];
    expect(Object.keys(input.variables)).toEqual(expect.arrayContaining([
      "eventTitle", "eventDate", "seatCount", "attendees", "amount", "orderId", "ctaUrl", "refundPolicyUrl",
    ]));
    expect(input.variables).toMatchObject({
      eventTitle: eventSummary.title,
      seatCount: "3",
      orderId,
      // The only guard for a placeholder the error handler swallows: a missing
      // `refundPolicyUrl` would stop the receipt sending while the webhook still
      // reported success, so the key's presence and its order-built value are pinned.
      refundPolicyUrl: "https://w.test/refund-policy",
    });
    // The real renderer ran, so a missing placeholder would have thrown and left
    // the transport empty rather than failing the assertion above in silence.
    expect(transport.sends).toHaveLength(1);
  });

  it("sends the confirmation with the Chinese copy for a zh-HK buyer", async () => {
    const {processor, renderEmail, transport} = buildTicketProcessor({
      settle: {status: "paid", order: {...pendingOrder, status: "paid", buyerLocale: "zh-HK"}},
    });

    await processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"));

    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({locale: "zh-HK"}));
    const input = (renderEmail.mock.calls[0] as unknown as [RenderEmailInput])[0];
    // Built from the order's own locale, so the Chinese receipt links to the Chinese policy.
    expect(input.variables).toMatchObject({refundPolicyUrl: "https://w.test/zh/refund-policy"});
    expect(transport.sends).toHaveLength(1);
  });

  it("settles without sending when the order is already paid or unknown", async () => {
    const {processor, transport} = buildTicketProcessor({settle: {status: "duplicate", order: pendingOrder}});

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");

    expect(transport.sends).toEqual([]);
  });

  // The receipt's event read throws *before* `sendTicketEmail`'s own catch, so an
  // unguarded paid branch rejects `process` → 500, and on redelivery `settlePaid`
  // answers `duplicate` and neither receipt nor pass is ever sent.
  it("keeps the webhook successful when the paid branch's event read fails", async () => {
    const orders = {
      settlePaid: vi.fn(async (): Promise<SettleResult> => ({status: "paid", order: {...pendingOrder, status: "paid"}})),
      expireBySession: vi.fn(async () => undefined),
      eventSummary: vi.fn(async () => { throw new Error("EVENT_SUMMARY_UNAVAILABLE"); }),
      seatsOfOrder: vi.fn(async () => 1),
      orderSeats: vi.fn(async () => []),
      seatForPass: vi.fn(async () => null),
    };
    const onEmailError = vi.fn();
    const processor = createTicketProcessor({
      orders: orders as unknown as TicketProcessorDependencies["orders"],
      refundPaymentIntent: vi.fn(async () => undefined),
      email: {renderEmail, transport: createTestTransport(), emailFrom: "tickets@wtia.test"},
      appUrl: "https://w.test",
      passSecret: "pass-secret-fixture",
      now: () => new Date("2026-09-14T04:00:00Z"),
      onEmailError,
    });

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");
    expect(onEmailError).toHaveBeenCalledWith(expect.any(Error), {orderId, template: "event_ticket_confirmation"});
  });

  it("keeps the webhook successful when the ticket email fails", async () => {
    const orders = {
      settlePaid: vi.fn(async (): Promise<SettleResult> => ({status: "paid", order: {...pendingOrder, status: "paid"}})),
      expireBySession: vi.fn(async () => undefined),
      eventSummary: vi.fn(async () => eventSummary),
      seatsOfOrder: vi.fn(async () => 1),
      orderSeats: vi.fn(async () => []),
      seatForPass: vi.fn(async () => null),
    };
    const onEmailError = vi.fn();
    const processor = createTicketProcessor({
      orders: orders as unknown as TicketProcessorDependencies["orders"],
      refundPaymentIntent: vi.fn(async () => undefined),
      email: {
        renderEmail: vi.fn(async () => { throw new Error("EMAIL_VARIABLE_MISSING:eventDate"); }) as unknown as typeof renderEmail,
        transport: createTestTransport(),
        emailFrom: "tickets@wtia.test",
      },
      appUrl: "https://w.test",
      passSecret: "pass-secret-fixture",
      now: () => new Date("2026-09-14T04:00:00Z"),
      onEmailError,
    });

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");
    expect(onEmailError).toHaveBeenCalledWith(expect.any(Error), {orderId, template: "event_ticket_confirmation"});
  });
});
