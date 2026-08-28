import {describe, expect, it, vi} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import {getPublicEventBySlug, registerForEvent, type EventRegistrationDependencies} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const eventId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2030-01-01T10:00:00.000Z");
const member: Actor = {kind: "member", userId: "member-user", profileId};

function publicEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: eventId,
    slug: "public-event",
    titleEn: "Public Event",
    titleZh: null,
    descriptionEn: "Public description",
    descriptionZh: null,
    startsAt: new Date("2030-01-01T09:00:00.000Z"),
    endsAt: new Date("2030-01-01T12:00:00.000Z"),
    venue: "WTIA",
    capacity: 2,
    memberOnly: false,
    published: true,
    heroMediaId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function registrationDependencies(overrides: Partial<{
  event: ReturnType<typeof publicEvent> | null;
  eligible: boolean;
  existing: {status: "registered" | "waitlist" | "cancelled" | "attended" | "no_show"} | null;
  count: number;
}> = {}) {
  const calls: string[] = [];
  const lockEvent = vi.fn(async () => { calls.push("lock"); return overrides.event === undefined ? publicEvent() : overrides.event; });
  const hasEligibleMembership = vi.fn(async () => { calls.push("membership"); return overrides.eligible ?? true; });
  const getRegistration = vi.fn(async () => { calls.push("duplicate"); return overrides.existing ?? null; });
  const countRegistered = vi.fn(async () => { calls.push("capacity"); return overrides.count ?? 0; });
  const upsertRegistration = vi.fn(async () => { calls.push("write"); });
  const insertAudit = vi.fn(async () => { calls.push("audit"); });
  const dependencies: EventRegistrationDependencies = {
    now: () => now,
    transaction: async (work) => work({lockEvent, hasEligibleMembership, getRegistration, countRegistered, upsertRegistration, insertAudit}),
  };
  return {calls, dependencies, lockEvent, hasEligibleMembership, getRegistration, countRegistered, upsertRegistration, insertAudit};
}

describe("public Event projection review regression", () => {
  it("keeps an own-origin private media hero in the public DTO", async () => {
    const url = "/api/media/10000000-0000-4000-8000-000000000001";
    const source = [{event: publicEvent(), hero: {url, altEn: "Private hero", altZh: "私人圖片", archivedAt: null}}] as const;

    await expect(getPublicEventBySlug("public-event", "en", {asOf: now, source})).resolves.toMatchObject({hero: {url, alt: "Private hero"}});
  });

  it("drops an unarchived external donor hero before it enters the public DTO", async () => {
    const source = [{
      event: publicEvent(),
      hero: {url: "https://donor.example/hero.png", altEn: "Donor hero", altZh: "捐贈圖片", archivedAt: null},
    }] as const;

    await expect(getPublicEventBySlug("public-event", "en", {asOf: now, source})).resolves.toMatchObject({hero: null});
  });
});

describe("Event registration lock order", () => {
  it.each([
    ["missing", {event: null}, "EVENT_NOT_FOUND", ["lock"]],
    ["unpublished", {event: publicEvent({published: false})}, "EVENT_NOT_FOUND", ["lock"]],
    ["closed strictly before now", {event: publicEvent({endsAt: new Date(now.getTime() - 1)})}, "EVENT_REGISTRATION_CLOSED", ["lock"]],
    ["ineligible", {eligible: false}, "MEMBERSHIP_INACTIVE", ["lock", "membership"]],
  ] as const)("stops after the %s gate and never reaches later checks or writes", async (_name, overrides, error, expectedCalls) => {
    const {calls, dependencies, getRegistration, countRegistered, upsertRegistration, insertAudit} = registrationDependencies(overrides);

    await expect(registerForEvent(member, {eventId}, dependencies)).rejects.toThrow(error);

    expect(calls).toEqual(expectedCalls);
    expect(getRegistration).not.toHaveBeenCalled();
    expect(countRegistered).not.toHaveBeenCalled();
    expect(upsertRegistration).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("keeps equality at the closure boundary open and writes a registered audit in order", async () => {
    const {calls, dependencies} = registrationDependencies({event: publicEvent({endsAt: now})});

    await expect(registerForEvent(member, {eventId}, dependencies)).resolves.toEqual({disposition: "registered"});

    expect(calls).toEqual(["lock", "membership", "duplicate", "capacity", "write", "audit"]);
  });

  it.each([
    ["registered", "already_registered"],
    ["attended", "already_registered"],
    ["waitlist", "already_waitlisted"],
  ] as const)("returns %s duplicate disposition without capacity, write, or audit", async (status, disposition) => {
    const {calls, dependencies, countRegistered, upsertRegistration, insertAudit} = registrationDependencies({existing: {status}});

    await expect(registerForEvent(member, {eventId}, dependencies)).resolves.toEqual({disposition});

    expect(calls).toEqual(["lock", "membership", "duplicate"]);
    expect(countRegistered).not.toHaveBeenCalled();
    expect(upsertRegistration).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("uses capacity only after duplicate checks and records a waitlist disposition", async () => {
    const {calls, dependencies} = registrationDependencies({event: publicEvent({capacity: 2}), count: 2});

    await expect(registerForEvent(member, {eventId}, dependencies)).resolves.toEqual({disposition: "waitlist"});

    expect(calls).toEqual(["lock", "membership", "duplicate", "capacity", "write", "audit"]);
  });
});
