import {isValidElement, type ComponentProps, type ReactElement, type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {Actor} from "@/lib/membership/lifecycle";
import type {Event} from "@/lib/db/server-schema";
import type {PublicEventProjection} from "@/lib/events/public";
import type {RegistrationStatus, EventRegistrationDependencies} from "@/lib/db/repos/events";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {legacyDerivedEventColumns} from "@/tests/fixtures/event-row";

const state = vi.hoisted(() => ({
  actor: null as Actor | null,
  event: null as PublicEventProjection | null,
  rows: new Map<string, {eventId: string; profileId: string; status: RegistrationStatus}>(),
  eligible: true,
  read: vi.fn(),
  history: vi.fn(),
  register: vi.fn(),
  write: vi.fn(),
  audit: vi.fn(),
  database: vi.fn(() => {throw new Error("UNEXPECTED_LIVE_DATABASE");}),
}));

vi.mock("@/lib/db/repos/common", () => ({getDb: state.database}));
vi.mock("@/lib/db/repos/events", async (original) => {
  const actual = await original<typeof import("@/lib/db/repos/events")>();
  return {...actual, eventsRepository: {...actual.eventsRepository,
    getPublicBySlug: async () => state.event, register: state.register}};
});
vi.mock("@/lib/auth/actor", () => ({
  getActor: async () => state.actor,
  requireActor: async () => {if (!state.actor) throw new Error("UNAUTHORIZED"); return state.actor;},
}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {getById: async () => null}}));
vi.mock("@/lib/db/repos/portal-registrations", () => ({
  readOwnRegistrationStatuses: state.read, listOwnRegistrationHistory: state.history,
}));
vi.mock("@/lib/events/guest-registration-action", () => ({submitGuestRsvpAction: vi.fn()}));
vi.mock("@/components/marketing/guest-rsvp-form", () => ({GuestRsvpForm: () => <div data-guest-rsvp="true"/>}));
vi.mock("@/components/marketing/ticket-checkout-form", () => ({TicketCheckoutForm: () => <div data-ticket-checkout="true"/>}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) => (key: string) => {
    let value: unknown = locale === "zh-HK" ? zh : en;
    for (const segment of `${namespace}.${key}`.split(".")) value = (value as Record<string, unknown>)?.[segment];
    return typeof value === "string" ? value : key;
  },
}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));

import EventPage from "@/app/[locale]/(public)/events/[slug]/page";
import {EventRegistrationForm} from "@/components/portal/event-registration-form";
import {listEventAttendees, registerForEvent} from "@/lib/db/repos/events";
import {getMyRegistrations} from "@/lib/portal/my-events";

const eventId = "11111111-1111-4111-8111-111111111111";
const member = {kind: "member", userId: "auth-a", profileId: "profile-a"} as const;
const other = {kind: "member", userId: "auth-b", profileId: "profile-b"} as const;
const staff = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"} as const;
const future = new Date("2099-01-01T10:00:00.000Z");
const row: Event = {
  ...legacyDerivedEventColumns({published: true, memberOnly: false, createdAt: future}),
  id: eventId, slug: "public-rsvp-status", titleEn: "Synthetic public RSVP", titleZh: "Synthetic RSVP",
  descriptionEn: "Synthetic event", descriptionZh: null, startsAt: future, endsAt: null,
  venue: null, capacity: 10, memberOnly: false, published: true, heroMediaId: null,
  createdAt: future, updatedAt: future,
};
const key = (profileId: string) => `${eventId}:${profileId}`;
const own = (profileId: string) => [...state.rows.values()].filter((r) => r.profileId === profileId);
const dependencies: EventRegistrationDependencies = {
  now: () => new Date("2030-01-01T00:00:00.000Z"),
  enrollReminder: async () => undefined,
  transaction: async (work) => work({
    lockEvent: async (id) => id === eventId ? row : null,
    hasEligibleMembership: async () => state.eligible,
    getRegistration: async (_id, profileId) => state.rows.get(key(profileId)) ?? null,
    countRegistered: async () => [...state.rows.values()].filter((r) => r.status === "registered").length,
    upsertRegistration: async (id, profileId, status) => {
      state.write(id, profileId, status);
      state.rows.set(key(profileId), {eventId: id, profileId, status});
    },
    insertAudit: state.audit,
  }),
};

function registration(node: ReactNode): ReactElement<ComponentProps<typeof EventRegistrationForm>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {const found = registration(child); if (found) return found;}
    return null;
  }
  if (!isValidElement<{children?: ReactNode}>(node)) return null;
  if (node.type === EventRegistrationForm) return node as ReactElement<ComponentProps<typeof EventRegistrationForm>>;
  return registration(node.props.children);
}
const page = (locale = "en") => EventPage({params: Promise.resolve({locale, slug: row.slug})});
const html = async (locale = "en") => new DOMParser().parseFromString(renderToStaticMarkup(await page(locale)), "text/html");
const button = (document: Document) => document.querySelector(".portal-registration-form button[type=submit]");

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = member; state.eligible = true; state.rows.clear();
  state.event = {
    id: eventId, slug: row.slug, title: row.titleEn, description: row.descriptionEn,
    startsAt: future.toISOString(), endsAt: null, venue: null, capacity: 10, hero: null,
    format: "in_person", onlineUrl: null, tags: [], registrationMode: "rsvp",
    externalRegistrationUrl: null, ticketPriceHkdCents: null, cancelled: false, organiser: null,
  };
  state.read.mockImplementation(async (actor: Extract<Actor, {kind: "member"}>, ids: readonly string[]) =>
    own(actor.profileId).filter((r) => ids.includes(r.eventId)).map(({eventId, status}) => ({eventId, status})));
  state.history.mockImplementation(async (actor: Extract<Actor, {kind: "member"}>) => ({
    items: own(actor.profileId).map((r) => ({
      id: r.eventId, eventId: r.eventId, source: "rsvp", status: r.status, titleEn: row.titleEn, titleZh: row.titleZh,
      startsAt: "2099-01-01T10:00:00.000000Z", eventStatus: "published", visibility: "public",
    })), nextCursor: null, cursorReset: false,
  }));
  state.register.mockImplementation((actor: Actor, input: unknown) => registerForEvent(actor, input, dependencies));
});

describe("public RSVP saved state on a fresh page render", () => {
  for (const locale of ["en", "zh-HK"] as const) {
    it.each(["registered", "waitlist", "attended", "no_show"] as const)(`${locale}: restores %s without another Register button`, async (status) => {
      state.rows.set(key(member.profileId), {eventId, profileId: member.profileId, status});
      const document = await html(locale);
      expect(document.querySelector('[role="status"].portal-status-note')?.textContent)
        .toBe((locale === "en" ? en : zh).Portal.myEvents.rsvpStatus[status]);
      expect(button(document)).toBeNull();
      expect(state.read).toHaveBeenCalledExactlyOnceWith(member, [eventId]);
      expect(state.register).not.toHaveBeenCalled();
      expect(state.database).not.toHaveBeenCalled();
    });
    it.each([undefined, "cancelled"] as const)(`${locale}: keeps the existing re-registration path for %s`, async (status) => {
      if (status) state.rows.set(key(member.profileId), {eventId, profileId: member.profileId, status});
      expect(button(await html(locale))?.textContent).toBe((locale === "en" ? en : zh).Events.registration.submit);
    });
    it(`${locale}: keeps the public content but does not mistake a failed status read for no registration`, async () => {
      state.read.mockRejectedValueOnce(new Error("PRIVATE_READ_DETAILS"));
      const document = await html(locale);
      expect(document.querySelector('p[role="alert"]')?.textContent).toBe((locale === "en" ? en : zh).Events.guest.unavailable);
      expect(button(document)).toBeNull();
      expect(document.body.textContent).toContain(row.titleEn);
      expect(document.body.textContent).not.toContain("PRIVATE_READ_DETAILS");
    });
  }
  it("reads only the current profile, so another member does not inherit the first member's saved state", async () => {
    state.rows.set(key(member.profileId), {eventId, profileId: member.profileId, status: "registered"});
    state.actor = other;
    expect(button(await html())).not.toBeNull();
    expect(state.read).toHaveBeenCalledExactlyOnceWith(other, [eventId]);
  });
  it.each([null, staff] as const)("does not query private member statuses for actor %o", async (actor) => {
    state.actor = actor;
    const document = await html();
    expect(state.read).not.toHaveBeenCalled();
    if (!actor) expect(document.querySelector("[data-guest-rsvp]")).not.toBeNull();
  });
  it.each(["external", "ticketed"] as const)("does not query RSVP state or change the %s flow", async (registrationMode) => {
    state.event = {...state.event!, registrationMode, externalRegistrationUrl: "https://organiser.example.test",
      ticketPriceHkdCents: registrationMode === "ticketed" ? 10000 : null};
    const document = await html();
    expect(state.read).not.toHaveBeenCalled();
    expect(button(document)).toBeNull();
    if (registrationMode === "ticketed") expect(document.querySelector("[data-ticket-checkout]")).not.toBeNull();
    else expect(document.querySelector('a[href="https://organiser.example.test"]')).not.toBeNull();
  });
});

describe("in-memory RSVP action and read-model contract (no live DB)", () => {
  it.each(["en", "zh-HK"])("%s: a real action retry keeps one row, and public/member/admin readers agree", async (locale) => {
    const form = registration(await page(locale));
    expect(form).not.toBeNull();
    const data = new FormData(); data.set("eventId", eventId);
    const first = await form!.props.action({}, data);
    const retry = await form!.props.action({}, data);
    expect(first.code).toBe("registered"); expect(retry.code).toBe("already_registered");
    expect(state.rows.size).toBe(1); expect(state.write).toHaveBeenCalledTimes(1); expect(state.audit).toHaveBeenCalledTimes(1);
    expect(button(await html(locale))).toBeNull();
    const history = await getMyRegistrations(member, {}, locale as "en" | "zh-HK");
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({eventId, status: "registered"});
    const dialect = new PgDialect();
    const database = {execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const sql = dialect.sqlToQuery(query); expect(sql.params).toContain(eventId);
      if (/select .* as id from "events"/i.test(sql.sql)) return {rows: [{id: eventId}]};
      return {rows: [...state.rows.values()].map((r) => ({
        kind: "member", profile_id: r.profileId, guest_id: null, seat_id: null, order_id: null,
        display_name: "Synthetic member", email: "member@example.test", organisation: null, status: r.status, checked_in_at: null,
      }))};
    })};
    const attendees = await listEventAttendees(staff, eventId, {loadDatabase: async () => database as never});
    expect(attendees).toHaveLength(1); expect(attendees?.[0]).toMatchObject({profileId: member.profileId, status: history.items[0].status});
    database.execute.mockClear();
    await expect(listEventAttendees(member, eventId, {loadDatabase: async () => database as never})).rejects.toThrow("FORBIDDEN");
    expect(database.execute).not.toHaveBeenCalled();
    expect(state.database).not.toHaveBeenCalled();
  });
  it("still rejects a new RSVP when the existing membership eligibility check fails", async () => {
    state.eligible = false;
    const form = registration(await page()); const data = new FormData(); data.set("eventId", eventId);
    expect((await form!.props.action({}, data)).code).toBe("ineligible");
    expect(state.write).not.toHaveBeenCalled(); expect(state.rows.size).toBe(0);
  });
});
