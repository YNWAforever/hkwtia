import {describe, expect, it, vi} from "vitest";

import {systemActor} from "@/lib/auth/authorize";
import {
  createTicketProcessor,
  sendSeatPass,
  type TicketProcessorDependencies,
} from "@/lib/billing/ticket-webhook-processor";
import type {OrderRecord, SettleResult} from "@/lib/db/repos/event-orders";
import {renderEmail, type RenderEmailInput} from "@/lib/email/render";
import {verifyPassToken} from "@/lib/tickets/pass-token";
import type {EmailSendInput, EmailTransport} from "@/lib/email/transport";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";

const orderId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const seatA = "11111111-1111-4111-8111-111111111111";
const seatB = "22222222-2222-4222-8222-222222222222";
const sessionId = "cs_ticket_pass";
const paymentIntentId = "pi_ticket_pass";
const passSecret = "pass-secret-fixture";
const settlement = new Date("2026-09-14T04:00:00Z");

const paidOrder: OrderRecord = {
  id: orderId,
  eventId,
  buyerProfileId: null,
  buyerName: "Ada Buyer",
  buyerEmail: "buyer@example.test",
  buyerLocale: "en",
  amountHkdCents: 50_000,
  currency: "hkd",
  status: "paid",
  stripeCheckoutSessionId: sessionId,
  stripeCheckoutUrl: null,
  idempotencyKey: "idem-pass",
  expiresAt: new Date("2026-09-14T04:30:00Z"),
  paidAt: settlement,
  refundedAt: null,
  refundReason: null,
};

const eventSummary = {
  title: "Edge AI for Builders",
  startsAt: new Date("2026-10-01T10:00:00Z"),
  slug: "edge-ai-for-builders",
  venue: "KOHO, Kwun Tong",
};

const seatRows = [
  {seatId: seatA, position: 1, attendeeName: "Ada"},
  {seatId: seatB, position: 2, attendeeName: "Bob"},
];

type SeatPass = Readonly<{
  seatId: string;
  attendeeName: string;
  attendeeEmail: string;
  eventId: string;
  buyerLocale: "en" | "zh-HK";
  order: OrderRecord;
}>;

const seatPasses: Record<string, SeatPass> = {
  [seatA]: {seatId: seatA, attendeeName: "Ada", attendeeEmail: "ada@example.test", eventId, buyerLocale: "en", order: paidOrder},
  [seatB]: {seatId: seatB, attendeeName: "Bob", attendeeEmail: "bob@example.test", eventId, buyerLocale: "en", order: paidOrder},
};

const command = {
  eventId: "evt_pass",
  eventType: "checkout.session.completed" as const,
  orderId,
  checkoutSessionId: sessionId,
  paymentIntentId,
};

/**
 * A provider-shaped transport: it drops a repeated idempotency key the way
 * Resend does, so the pass key's behaviour is observed rather than assumed.
 */
function createIdempotentTransport(): EmailTransport & Readonly<{sends: EmailSendInput[]}> {
  const sends: EmailSendInput[] = [];
  const seen = new Set<string>();
  return {
    sends,
    async send(input) {
      if (seen.has(input.idempotencyKey)) {
        return {status: "sent", providerId: `duplicate:${input.idempotencyKey}`};
      }
      seen.add(input.idempotencyKey);
      sends.push(structuredClone(input));
      return {status: "sent", providerId: `test:${input.idempotencyKey}`};
    },
  };
}

function build(options: {settle?: SettleResult} = {}) {
  const orders = {
    settlePaid: vi.fn(async (): Promise<SettleResult> => options.settle ?? {status: "paid", order: paidOrder}),
    expireBySession: vi.fn(async () => undefined),
    eventSummary: vi.fn(async () => eventSummary),
    seatsOfOrder: vi.fn(async () => seatRows.length),
    orderSeats: vi.fn(async () => seatRows),
    seatForPass: vi.fn(async (seatId: string) => seatPasses[seatId] ?? null),
  };
  const transport = createIdempotentTransport();
  // The real renderer runs behind the spy, so a missing placeholder throws and
  // the send is skipped — the same silence production would see.
  const renderEmailSpy = vi.fn(renderEmail);
  const dependencies: TicketProcessorDependencies = {
    orders: orders as unknown as TicketProcessorDependencies["orders"],
    refundPaymentIntent: vi.fn(async () => undefined),
    email: {
      renderEmail: renderEmailSpy as unknown as typeof renderEmail,
      transport,
      emailFrom: "tickets@wtia.test",
    },
    appUrl: "https://w.test",
    passSecret,
    now: () => settlement,
  };
  return {processor: createTicketProcessor(dependencies), dependencies, orders, transport, renderEmail: renderEmailSpy};
}

function passSends(sends: readonly EmailSendInput[]): EmailSendInput[] {
  return sends.filter((send) => send.idempotencyKey.startsWith("ticket-pass:"));
}

function passInputs(spy: ReturnType<typeof vi.fn>): RenderEmailInput[] {
  return (spy.mock.calls as unknown as [RenderEmailInput][])
    .map(([input]) => input)
    .filter((input) => input.template === "event_ticket_pass");
}

describe("ticket pass email", () => {
  it("sends one pass per seat, each to that seat's own address and its own signed URL", async () => {
    const {processor, transport, renderEmail: renderEmailSpy} = build();

    await processor.process(systemActor("stripe-webhook"), command);

    const sends = passSends(transport.sends);
    expect(sends).toHaveLength(2);
    expect(sends.map((send) => send.to).sort()).toEqual(["ada@example.test", "bob@example.test"]);

    const inputs = passInputs(renderEmailSpy);
    expect(inputs).toHaveLength(2);
    const tokens = inputs.map((input) => {
      const ctaUrl = String(input.variables.ctaUrl);
      const match = /\/pass\/(.+)$/.exec(ctaUrl);
      expect(match).not.toBeNull();
      return verifyPassToken(match![1]!, passSecret);
    });
    expect(tokens.map((token) => token?.seatId).sort()).toEqual([seatA, seatB].sort());
    expect(tokens.every((token) => token?.eventId === eventId)).toBe(true);
    expect(new Set(inputs.map((input) => input.variables.ctaUrl)).size).toBe(2);
  });

  it("supplies every placeholder the pass copy uses", async () => {
    const {processor, transport, renderEmail: renderEmailSpy} = build();

    await processor.process(systemActor("stripe-webhook"), command);

    const placeholders = new Set<string>();
    const bundles = [en, zhHK] as unknown as readonly {Email: {templates: Record<string, Record<string, string>>}}[];
    for (const bundle of bundles) {
      for (const value of Object.values(bundle.Email.templates.event_ticket_pass!)) {
        for (const match of value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
          placeholders.add(match[1]!);
        }
      }
    }
    // Guard against a broken regex passing vacuously.
    expect(placeholders.size).toBeGreaterThan(0);

    const input = passInputs(renderEmailSpy)[0]!;
    for (const name of placeholders) {
      expect(Object.keys(input.variables)).toContain(name);
    }
    // The real renderer ran, so a missing placeholder would have thrown and left
    // the transport empty rather than only failing the key assertion above.
    expect(passSends(transport.sends)).toHaveLength(2);
  });

  it.each(["refund_due", "oversold"] as const)("sends no pass email when the settlement is %s", async (status) => {
    const {processor, transport, renderEmail: renderEmailSpy} = build({
      settle: {status, order: {...paidOrder, status: "refunded", refundReason: "oversold"}},
    });

    await processor.process(systemActor("stripe-webhook"), command);

    expect(passSends(transport.sends)).toEqual([]);
    expect(renderEmailSpy.mock.calls.some(([input]) => (input as RenderEmailInput).template === "event_ticket_pass")).toBe(false);
  });

  it("sends no second pass on a webhook redelivery", async () => {
    const {processor, orders, transport} = build();
    await processor.process(systemActor("stripe-webhook"), command);
    expect(passSends(transport.sends)).toHaveLength(2);

    orders.settlePaid.mockResolvedValueOnce({status: "duplicate", order: paidOrder});
    await processor.process(systemActor("stripe-webhook"), command);

    expect(passSends(transport.sends)).toHaveLength(2);
  });

  it("dedupes a repeated settlement key but sends again for a deliberate resend", async () => {
    const {dependencies, transport} = build();

    await sendSeatPass(dependencies, {seatId: seatA, attemptKey: String(settlement.getTime())});
    await sendSeatPass(dependencies, {seatId: seatA, attemptKey: String(settlement.getTime())});
    expect(passSends(transport.sends)).toHaveLength(1);

    await sendSeatPass(dependencies, {seatId: seatA, attemptKey: `resend:${Date.now()}`});
    const sends = passSends(transport.sends);
    expect(sends).toHaveLength(2);
    expect(sends[0]!.idempotencyKey).not.toBe(sends[1]!.idempotencyKey);
  });

  it("sends nothing for a seat whose order is not paid", async () => {
    const {dependencies, transport} = build();

    await sendSeatPass(dependencies, {seatId: "55555555-5555-4555-8555-555555555555", attemptKey: "1"});

    expect(transport.sends).toEqual([]);
  });
});
