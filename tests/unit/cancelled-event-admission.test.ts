import {describe, expect, it} from "vitest";

import {checkInAttendee} from "@/lib/admin/events";
import {contactWriterActor} from "@/lib/db/repos/contacts";
import {createEventGuestsRepository} from "@/lib/db/repos/event-guests";
import {registerForEvent, type EventRegistrationDependencies} from "@/lib/db/repos/events";
import {createTicketCheckInRepository} from "@/lib/db/repos/ticket-check-in";
import type {EventStatus} from "@/lib/db/schema-core";
import {derivedEventFlags} from "@/lib/events/status";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";
import {createTicketCheckout, type TicketCheckoutDependencies} from "@/lib/tickets/checkout-core";

/**
 * Phase D-4d whole-branch finding. The per-task review of the check-in slice
 * proved a TICKET seat cannot enter a cancelled event — the loader and the
 * write both refuse — and that was read as "the check-in rules already refuse a
 * cancelled event". It was not true of the other door: `checkInAttendee` locked
 * only the member registration, never the event, so an RSVP event's door list
 * still admitted people and awarded `event_attended` points.
 *
 * A single test that names one path would have missed that, and a future path —
 * a new RSVP surface, a new seat writer — could reintroduce it just as quietly.
 * So this enumerates EVERY door into an event and drives each through its real
 * unit: ticket checkout, member RSVP, guest RSVP, ticket door check-in and
 * member door check-in. Each attempt is a function of the event status, and the
 * suite is run twice: cancelled must refuse every path, published must ADMIT
 * every path. The second half is the control that keeps the first honest — a
 * test asserting only refusals would pass even if every door were simply broken.
 */

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const SEAT_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const startsAt = new Date("2030-03-01T02:00:00Z");
const at = new Date("2026-09-16T04:00:00Z");

const staff: AdminActor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};

/** What a door did with an attempt: admitted, or refused with its own reason. */
type AttemptResult = Readonly<{admitted: boolean; detail: string}>;

function flagsFor(status: EventStatus) {
  return derivedEventFlags({status, visibility: "public"});
}

/** The checkout's own copy of the event: it reads the derived `published` flag. */
function ticketEvent(status: EventStatus) {
  return {
    id: EVENT_ID,
    slug: "cancelled-acceptance-event",
    titleEn: "Cancelled event",
    titleZh: "已取消活動",
    startsAt,
    published: flagsFor(status).published,
    registrationMode: "ticketed" as const,
    ticketPriceHkdCents: 1_000,
  };
}

async function attemptTicketCheckout(status: EventStatus): Promise<AttemptResult> {
  // A cancelled event's `published` flag is false and `createTicketCheckout`
  // refuses on it. Reaching `createOrder` is the admitted outcome; the fake
  // returns an open stored session, because the subject is admission, not Stripe.
  const dependencies = {
    orders: {
      createOrder: async () => ({ok: true, reused: true, order: {stripeCheckoutSessionId: "cs_matrix", stripeCheckoutUrl: "https://checkout.stripe.test/x"}}),
    },
    stripe: {ticketSessionStatus: async () => "open"},
    eventForTicket: async () => ticketEvent(status),
    appUrl: "https://app.example.test",
    now: () => at,
  } as unknown as TicketCheckoutDependencies;

  const result = await createTicketCheckout({
    eventId: EVENT_ID,
    buyer: {profileId: null, name: "Buyer", email: "buyer@example.test"},
    seats: [{name: "Buyer", email: "buyer@example.test"}],
    idempotencyKey: "matrix-checkout",
    locale: "en",
  }, dependencies);
  return result.status === "error"
    ? {admitted: false, detail: `checkout:${result.code}`}
    : {admitted: true, detail: "checkout:redirect"};
}

async function attemptMemberRsvp(status: EventStatus): Promise<AttemptResult> {
  const dependencies: EventRegistrationDependencies = {
    transaction: async (work) => work({
      lockEvent: async () => ({id: EVENT_ID, capacity: null, published: flagsFor(status).published, registrationMode: "rsvp", visibility: "public", startsAt, endsAt: null}),
      hasEligibleMembership: async () => true,
      getRegistration: async () => null,
      countRegistered: async () => 0,
      upsertRegistration: async () => undefined,
      insertAudit: async () => undefined,
    }),
    now: () => at,
    // The reminder is a courtesy enrolled after the seat commits; the subject is
    // admission, and an unstubbed enrolment would reach for a database.
    enrollReminder: async () => undefined,
  };
  try {
    const {disposition} = await registerForEvent(member, {eventId: EVENT_ID}, dependencies);
    return {admitted: true, detail: `member-rsvp:${disposition}`};
  } catch (error) {
    return {admitted: false, detail: `member-rsvp:${(error as Error).message}`};
  }
}

async function attemptGuestRsvp(status: EventStatus): Promise<AttemptResult> {
  // The repository reads the raw `status` string (it is not part of the public
  // projection), so this is the one door that refuses on `cancelled` directly.
  const replies = [
    [{
      id: EVENT_ID, slug: "cancelled-acceptance-event", title_en: "Cancelled event", title_zh: null,
      status, visibility: "public", registration_mode: "rsvp", capacity: null, starts_at: startsAt, ends_at: null,
    }],
    [{count: 0}], [], [{id: EVENT_ID, status: "registered"}], [],
  ];
  const database = {
    transaction: async <T>(work: (tx: {execute: (query: unknown) => Promise<unknown>}) => Promise<T>) => work({
      execute: async () => ({rows: replies.shift() ?? []}),
    }),
  };
  const repository = createEventGuestsRepository(async () => database as never, () => at);
  try {
    const {disposition} = await repository.register(contactWriterActor("event_guest"), {
      eventId: EVENT_ID, name: "Guest", email: "guest@example.test", locale: "en",
      whatsappNumber: null, organisation: null, marketingConsent: false,
      idempotencyKey: "matrix-guest", cancelTokenDigest: "a".repeat(64),
    });
    return {admitted: true, detail: `guest-rsvp:${disposition}`};
  } catch (error) {
    return {admitted: false, detail: `guest-rsvp:${(error as Error).message}`};
  }
}

async function attemptTicketDoorCheckIn(status: EventStatus): Promise<AttemptResult> {
  const repository = createTicketCheckInRepository({
    transaction: async (work) => work({
      lockSeat: async () => ({
        seatId: SEAT_ID, eventId: EVENT_ID, position: 1, attendeeName: "Seat", attendeeEmail: "seat@example.test",
        checkedInAt: null, orderId: ORDER_ID, orderStatus: "paid", eventStatus: status,
      }),
      readSeat: async () => ({
        seatId: SEAT_ID, eventId: EVENT_ID, position: 1, attendeeName: "Seat", attendeeEmail: "seat@example.test",
        checkedInAt: null, orderId: ORDER_ID, orderStatus: "paid", eventStatus: status,
      }),
      lockEvent: async () => status,
      update: async () => undefined,
      insertAudit: async () => undefined,
    }),
    now: () => at,
  });
  const {disposition} = await repository.checkInSeat(staff, {seatId: SEAT_ID});
  return disposition === "not_admissible"
    ? {admitted: false, detail: `ticket-check-in:${disposition}`}
    : {admitted: true, detail: `ticket-check-in:${disposition}`};
}

async function attemptMemberDoorCheckIn(status: EventStatus): Promise<AttemptResult> {
  const writes: string[] = [];
  const {disposition} = await checkInAttendee(staff, {eventId: EVENT_ID, profileId: "profile-member"}, {transaction: async (work) => work({
    lockEvent: async () => ({status}),
    lockRegistration: async () => ({status: "registered", checkedInAt: null}),
    markAttended: async () => { writes.push("attended"); },
    insertEngagement: async () => { writes.push("engagement"); },
    insertAudit: async () => { writes.push("audit"); },
  })});
  return disposition === "event_cancelled"
    ? {admitted: false, detail: `member-check-in:${disposition}`}
    : {admitted: true, detail: `member-check-in:${disposition}:${writes.join(",")}`};
}

const DOORS: readonly Readonly<{path: string; attempt: (status: EventStatus) => Promise<AttemptResult>}>[] = [
  {path: "ticket checkout", attempt: attemptTicketCheckout},
  {path: "member RSVP", attempt: attemptMemberRsvp},
  {path: "guest RSVP", attempt: attemptGuestRsvp},
  {path: "ticket door check-in", attempt: attemptTicketDoorCheckIn},
  {path: "member door check-in", attempt: attemptMemberDoorCheckIn},
];

describe("the cancellation admission matrix", () => {
  it.each(DOORS)("$path is refused for a cancelled event", async ({path, attempt}) => {
    const result = await attempt("cancelled");

    expect(result.admitted, `${path} admitted a cancelled event (${result.detail})`).toBe(false);
  });

  // The control: every door is otherwise reachable. Without this, a door that
  // refused everybody would satisfy the test above and prove nothing.
  it.each(DOORS)("$path is admitted for a published event", async ({path, attempt}) => {
    const result = await attempt("published");

    expect(result.admitted, `${path} refused a published event (${result.detail})`).toBe(true);
  });

  // The bug was a *write*: even if a future version hid the control, the action
  // is a published endpoint. This pins that the member door's refusal writes
  // neither attendance, engagement nor audit when the event is cancelled.
  it("writes nothing at the member door for a cancelled event", async () => {
    const writes: string[] = [];
    const {disposition} = await checkInAttendee(staff, {eventId: EVENT_ID, profileId: "profile-member"}, {transaction: async (work) => work({
      lockEvent: async () => ({status: "cancelled"}),
      lockRegistration: async () => ({status: "registered", checkedInAt: null}),
      markAttended: async () => { writes.push("attended"); },
      insertEngagement: async () => { writes.push("engagement"); },
      insertAudit: async () => { writes.push("audit"); },
    })});

    expect(disposition).toBe("event_cancelled");
    expect(writes).toEqual([]);
  });
});
