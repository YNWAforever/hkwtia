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
};

type TicketEventType = "checkout.session.completed" | "checkout.session.expired";

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
  summary?: {title: string; startsAt: Date; slug: string} | null;
} = {}) {
  const orders = {
    settlePaid: vi.fn(async (): Promise<SettleResult> => options.settle ?? {status: "paid", order: pendingOrder}),
    expireBySession: vi.fn(async () => undefined),
    eventSummary: vi.fn(async () => (options.summary === undefined ? eventSummary : options.summary)),
    seatsOfOrder: vi.fn(async () => options.seats ?? 2),
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

function command(eventType: TicketEventType): TicketWebhookCommand {
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

    expect(refundPaymentIntent).toHaveBeenCalledWith(paymentIntentId);
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({template: "event_ticket_refunded", locale: "en", recipientName: "Ada"}));
    expect(transport.sends).toHaveLength(1);
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
      "eventTitle", "eventDate", "seatCount", "amount", "orderId", "ctaUrl",
    ]));
    expect(input.variables).toMatchObject({eventTitle: eventSummary.title, seatCount: "3", orderId});
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
    expect(transport.sends).toHaveLength(1);
  });

  it("settles without sending when the order is already paid or unknown", async () => {
    const {processor, transport} = buildTicketProcessor({settle: {status: "duplicate", order: pendingOrder}});

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");

    expect(transport.sends).toEqual([]);
  });

  it("keeps the webhook successful when the ticket email fails", async () => {
    const orders = {
      settlePaid: vi.fn(async (): Promise<SettleResult> => ({status: "paid", order: {...pendingOrder, status: "paid"}})),
      expireBySession: vi.fn(async () => undefined),
      eventSummary: vi.fn(async () => eventSummary),
      seatsOfOrder: vi.fn(async () => 1),
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
      now: () => new Date("2026-09-14T04:00:00Z"),
      onEmailError,
    });

    await expect(processor.process(systemActor("stripe-webhook"), command("checkout.session.completed"))).resolves.toBe("processed");
    expect(onEmailError).toHaveBeenCalledWith(expect.any(Error), {orderId, template: "event_ticket_confirmation"});
  });
});
