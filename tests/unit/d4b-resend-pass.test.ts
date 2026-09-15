import {revalidatePath} from "next/cache";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {TicketProcessorDependencies} from "@/lib/billing/ticket-webhook-processor";
import type {OrderRecord} from "@/lib/db/repos/event-orders";
import {renderEmail} from "@/lib/email/render";
import type {EmailSendInput, EmailTransport} from "@/lib/email/transport";

const state = vi.hoisted(() => ({
  session: {kind: "staff", userId: "auth-1", profileId: "p-1"} as unknown,
  noSession: false,
  dependencies: undefined as unknown,
}));

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("NEXT_NOT_FOUND"); }}));
vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => {
    if (state.noSession) throw new Error("UNAUTHORIZED");
    return state.session;
  },
}));
vi.mock("@/lib/db/repos/events", () => ({createEvent: vi.fn(), updateEvent: vi.fn()}));
vi.mock("@/lib/admin/events", () => ({checkInAttendee: vi.fn()}));
// The real `sendSeatPass` runs; only the production dependency bag is substituted,
// so this exercises the same send the webhook uses rather than a stand-in whose
// attempt-key handling could drift from the real one.
vi.mock("@/lib/billing/ticket-webhook-processor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/ticket-webhook-processor")>();
  return {...actual, ticketProcessorDependencies: () => state.dependencies};
});

const orderId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const seatId = "11111111-1111-4111-8111-111111111111";
const settlement = new Date("2026-09-14T04:00:00Z");
const passSecret = "pass-secret-fixture";
const path = "/en/admin/events-mgmt/8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d";

const messages = {
  successMessage: "Pass email sent.",
  errorMessage: "We could not send this pass email. Please try again.",
} as const;

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
  stripeCheckoutSessionId: "cs_d4b_resend",
  stripeCheckoutUrl: null,
  idempotencyKey: "idem-d4b-resend",
  expiresAt: new Date("2026-09-14T04:30:00Z"),
  paidAt: settlement,
  refundedAt: null,
  refundReason: null,
};

function form(seat: string | null = seatId): FormData {
  const data = new FormData();
  if (seat !== null) data.set("seatId", seat);
  return data;
}

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

let transport: ReturnType<typeof createIdempotentTransport>;

const seatForPass = {
  seatId,
  attendeeName: "D4B Acceptance One",
  attendeeEmail: "d4b-one@example.test",
  eventId,
  buyerLocale: "en" as const,
  order: paidOrder,
};

function buildDependencies(options: Readonly<{seatPresent?: boolean}> = {}): TicketProcessorDependencies {
  transport = createIdempotentTransport();
  const orders = {
    settlePaid: vi.fn(),
    expireBySession: vi.fn(),
    seatsOfOrder: vi.fn(async () => 1),
    orderSeats: vi.fn(async () => [{seatId, position: 1, attendeeName: "D4B Acceptance One"}]),
    seatForPass: vi.fn(async () => (options.seatPresent === false ? null : seatForPass)),
    eventSummary: vi.fn(async () => ({
      title: "D4B Acceptance Ticket Event",
      startsAt: new Date("2026-10-14T11:00:00Z"),
      slug: "d4b-acceptance-ticket-event",
      venue: "WTIA Office",
    })),
  };
  return {
    orders: orders as unknown as TicketProcessorDependencies["orders"],
    refundPaymentIntent: vi.fn(async () => undefined),
    email: {renderEmail, transport, emailFrom: "tickets@wtia.test"},
    appUrl: "https://w.test",
    passSecret,
    now: () => settlement,
  };
}

function passSends(): EmailSendInput[] {
  return transport.sends.filter((send) => send.idempotencyKey.startsWith("ticket-pass:"));
}

function loadActions() {
  return import("@/lib/admin/event-actions");
}

describe("resendPassAction", () => {
  beforeEach(() => {
    state.noSession = false;
    state.dependencies = buildDependencies();
    vi.mocked(revalidatePath).mockClear();
  });

  it("sends again with a fresh attempt key, escaping the settlement-derived key", async () => {
    const {resendPassAction} = await loadActions();
    const {sendSeatPass} = await import("@/lib/billing/ticket-webhook-processor");

    // The webhook already sent this seat's pass under the settlement key. That
    // key is permanent at the transport, so a resend that re-used it would be
    // swallowed: the receipt of a "sent" that never reached anyone.
    await sendSeatPass(state.dependencies as TicketProcessorDependencies, {
      seatId,
      attemptKey: String(settlement.getTime()),
    });
    expect(passSends()).toHaveLength(1);

    await expect(resendPassAction(seatId, path, messages, {}, form(seatId))).resolves.toEqual({
      status: "success",
      message: "Pass email sent.",
    });
    // A send that actually left revalidates the event page the row lives on.
    expect(revalidatePath).toHaveBeenCalledWith(path);

    const sends = passSends();
    expect(sends).toHaveLength(2);
    expect(sends[0]!.idempotencyKey).toBe(`ticket-pass:${seatId}:${settlement.getTime()}`);
    expect(sends[1]!.idempotencyKey).toMatch(new RegExp(`^ticket-pass:${seatId}:resend:[0-9a-f-]{36}$`));
    expect(sends[1]!.idempotencyKey).not.toBe(sends[0]!.idempotencyKey);
    expect(sends[1]!.to).toBe("d4b-one@example.test");
  });

  it("sends twice when staff press it twice, and each send carries its own attempt", async () => {
    const {resendPassAction} = await loadActions();

    await resendPassAction(seatId, path, messages, {}, form(seatId));
    // No sleep separates the two presses: the attempt key is a random uuid, so
    // two presses in the same millisecond still carry distinct keys.
    await resendPassAction(seatId, path, messages, {}, form(seatId));

    const sends = passSends();
    expect(sends).toHaveLength(2);
    expect(sends[0]!.idempotencyKey).not.toBe(sends[1]!.idempotencyKey);
  });

  // A user-initiated send must be honest: the transport throwing is not a
  // success. `resendError` exists in both bundles precisely for this, and before
  // this fix the catch inside `sendTicketEmail` reported every failure as sent.
  it("reports a transport failure as not sent", async () => {
    const dependencies = buildDependencies();
    state.dependencies = {...dependencies, email: {renderEmail, transport: {async send() { throw new Error("provider 5xx"); }}, emailFrom: "tickets@wtia.test"}};
    const {resendPassAction} = await loadActions();

    await expect(resendPassAction(seatId, path, messages, {}, form(seatId))).resolves.toEqual({
      status: "error",
      message: "We could not send this pass email. Please try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // A refunded seat resolves to no seat at all, so nothing was sent; reporting
  // "Pass email sent." would be a lie the staff member would act on.
  it("reports a refunded or absent seat as not sent", async () => {
    state.dependencies = buildDependencies({seatPresent: false});
    const {resendPassAction} = await loadActions();

    await expect(resendPassAction(seatId, path, messages, {}, form(seatId))).resolves.toEqual({
      status: "error",
      message: "We could not send this pass email. Please try again.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // A staff-session denial is not a form outcome: it maps to notFound, the same
  // shape every sibling action in the module uses, so a signed-out caller sees
  // the route's 404 rather than a 500.
  it("refuses without a staff session, maps to notFound, and never sends", async () => {
    state.noSession = true;
    const {resendPassAction} = await loadActions();

    await expect(resendPassAction(seatId, path, messages, {}, form(seatId)))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(passSends()).toHaveLength(0);
  });

  it("falls back to the bound seat id when the form carries none", async () => {
    const {resendPassAction} = await loadActions();

    await expect(resendPassAction(seatId, path, messages, {}, form(null))).resolves.toEqual({
      status: "success",
      message: "Pass email sent.",
    });
    expect(passSends()).toHaveLength(1);
  });

  it("refuses a seat id that is not a uuid without sending", async () => {
    const {resendPassAction} = await loadActions();

    await expect(resendPassAction("", path, messages, {}, form("not-a-uuid"))).resolves.toEqual({
      status: "error",
      message: "We could not send this pass email. Please try again.",
    });
    expect(passSends()).toHaveLength(0);
  });
});
