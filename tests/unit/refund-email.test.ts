import {describe, expect, it, vi} from "vitest";

import type {OrderRecord} from "@/lib/db/repos/event-orders";
import {renderEmail, type RenderEmailInput} from "@/lib/email/render";
import {createTestTransport} from "@/lib/email/transport";
import {
  sendOrderRefundEmail,
  sendOrderRefundFailureEmail,
  type TicketProcessorDependencies,
} from "@/lib/billing/ticket-webhook-processor";
import {refundOrder, type RefundDependencies} from "@/lib/tickets/refund-core";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};
const orderId = "b1a2c3d4-1111-4222-8333-944455566677";

const eventSummary = {
  title: "Edge AI for Builders",
  startsAt: new Date("2026-10-01T10:00:00Z"),
  slug: "edge-ai-for-builders",
  venue: "KOHO, Kwun Tong",
};

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: orderId,
    eventId: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d",
    buyerProfileId: null,
    buyerName: "Ada",
    buyerEmail: "ada@example.test",
    buyerLocale: "en",
    amountHkdCents: 25_000,
    currency: "hkd",
    status: "paid",
    stripeCheckoutSessionId: "cs_test_1",
    stripeCheckoutUrl: null,
    idempotencyKey: "idem-1",
    expiresAt: new Date("2026-09-16T10:30:00Z"),
    paidAt: new Date("2026-09-16T10:00:00Z"),
    refundedAt: null,
    refundReason: null,
    ...overrides,
  };
}

function emailDependencies(
  options: Readonly<{render?: typeof renderEmail; onEmailError?: ReturnType<typeof vi.fn>}> = {},
) {
  const transport = createTestTransport();
  const renderEmailSpy = vi.fn(options.render ?? renderEmail);
  const dependencies: TicketProcessorDependencies = {
    orders: {eventSummary: vi.fn(async () => eventSummary)} as unknown as TicketProcessorDependencies["orders"],
    refundPaymentIntent: vi.fn(async () => undefined),
    email: {
      renderEmail: renderEmailSpy as unknown as typeof renderEmail,
      transport,
      emailFrom: "tickets@wtia.test",
    },
    appUrl: "https://w.test",
    passSecret: "pass-secret-fixture",
    now: () => new Date("2026-09-16T12:00:00Z"),
    ...(options.onEmailError ? {onEmailError: options.onEmailError} : {}),
  };
  return {dependencies, transport, renderEmail: renderEmailSpy};
}

function refundDependencies(email: TicketProcessorDependencies): RefundDependencies {
  return {
    orders: {
      orderById: vi.fn(async () => order()),
      refundPaidOrder: vi.fn(async () => true),
    },
    stripe: {
      paymentIntentForSession: vi.fn(async () => "pi_1"),
      refundPaymentIntent: vi.fn(async () => undefined),
      fullyRefundedPaymentIntent: vi.fn(async () => false),
    },
    sendRefundEmail: (committed) => sendOrderRefundEmail(committed, email),
    now: () => new Date("2026-09-16T12:00:00Z"),
  };
}

describe("sendOrderRefundEmail", () => {
  it("sends one refund email naming the order and its amount, in the order's locale", async () => {
    const {dependencies, transport, renderEmail: renderEmailSpy} = emailDependencies();

    await sendOrderRefundEmail(order({buyerLocale: "zh-HK"}), dependencies);

    expect(transport.sends).toHaveLength(1);
    const input = (renderEmailSpy.mock.calls[0] as unknown as [RenderEmailInput])[0];
    expect(input).toMatchObject({template: "event_ticket_refunded", locale: "zh-HK", recipientName: "Ada"});
    expect(input.variables).toMatchObject({amount: "250.00", orderId});
    expect(transport.sends[0]!.to).toBe("ada@example.test");
    // Deterministic per order: a re-issued refund re-uses the key, so the
    // transport collapses it rather than mailing the buyer twice.
    expect(transport.sends[0]!.idempotencyKey).toBe(`ticket-refund:${orderId}`);
  });

  it("uses a distinct key for a recovery notice after an earlier failure correction", async () => {
    const {dependencies, transport} = emailDependencies();
    await sendOrderRefundEmail(order(), dependencies, `ticket-refund-recovered:${orderId}:evt_success`);
    expect(transport.sends[0]!.idempotencyKey).toBe(`ticket-refund-recovered:${orderId}:evt_success`);
  });

  it("logs and swallows a mail failure, because the refund is already committed", async () => {
    const onEmailError = vi.fn();
    const {dependencies} = emailDependencies({
      render: vi.fn(async () => {
        throw new Error("EMAIL_VARIABLE_MISSING:amount");
      }) as unknown as typeof renderEmail,
      onEmailError,
    });

    await expect(sendOrderRefundEmail(order(), dependencies)).resolves.toBeUndefined();

    expect(onEmailError).toHaveBeenCalledWith(expect.any(Error), {orderId, template: "event_ticket_refunded"});
  });
});

describe("a later failed refund's correction", () => {
  it("emails the buyer in their language with a contact link and event-scoped key", async () => {
    const {dependencies, transport, renderEmail: renderEmailSpy} = emailDependencies();
    await sendOrderRefundFailureEmail(order({buyerLocale: "zh-HK"}), "evt_failed", dependencies);
    const input = (renderEmailSpy.mock.calls[0] as unknown as [RenderEmailInput])[0];
    expect(input).toMatchObject({template: "event_ticket_refund_failed", locale: "zh-HK"});
    expect(input.variables).toMatchObject({orderId, amount: "250.00", ctaUrl: "https://w.test/zh/contact"});
    expect(transport.sends).toHaveLength(1);
    expect(transport.sends[0]!.idempotencyKey).toBe(`ticket-refund-failed:${orderId}:evt_failed`);
  });
});
describe("a staff refund's notification", () => {
  it("sends exactly one event_ticket_refunded with the order's locale and amount", async () => {
    const {dependencies, transport, renderEmail: renderEmailSpy} = emailDependencies();

    const result = await refundOrder(staff, {orderId}, refundDependencies(dependencies));

    expect(result).toEqual({status: "refunded"});
    expect(transport.sends).toHaveLength(1);
    expect(renderEmailSpy).toHaveBeenCalledWith(expect.objectContaining({template: "event_ticket_refunded", locale: "en"}));
    const input = (renderEmailSpy.mock.calls[0] as unknown as [RenderEmailInput])[0];
    expect(input.variables).toMatchObject({amount: "250.00", orderId});
  });

  it("still returns refunded when the mail cannot be sent", async () => {
    const onEmailError = vi.fn();
    const {dependencies} = emailDependencies({
      render: vi.fn(async () => {
        throw new Error("mail_down");
      }) as unknown as typeof renderEmail,
      onEmailError,
    });
    const deps = refundDependencies(dependencies);

    const result = await refundOrder(staff, {orderId}, deps);

    expect(result).toEqual({status: "refunded"});
    expect(vi.mocked(deps.orders.refundPaidOrder)).toHaveBeenCalledTimes(1);
    expect(onEmailError).toHaveBeenCalledWith(expect.any(Error), {orderId, template: "event_ticket_refunded"});
  });
});
