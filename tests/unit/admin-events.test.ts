import {describe, expect, it, vi} from "vitest";

import {createEvent, registerForEvent, updateEvent, type EventMutationDependencies, type EventRegistrationDependencies} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member = (profileId: string): Actor => ({kind: "member", userId: `auth-${profileId}`, profileId});
const createInput = {slug: "member-mixer", titleEn: "Member mixer", titleZh: "會員交流會", descriptionEn: "Meet the community.", descriptionZh: "與社群交流。", startsAt: "2099-09-01T10:00:00.000Z", endsAt: "2099-09-01T12:00:00.000Z", venue: "WTIA", capacity: 1, memberOnly: true, published: true, heroMediaId: null};
const eventLock = {id: "11111111-1111-4111-8111-111111111111", capacity: 1, published: true, startsAt: new Date(createInput.startsAt), endsAt: new Date(createInput.endsAt)};

describe("admin Event mutations and registration capacity", () => {
  it("requires an admin and appends the audit in the same create transaction", async () => {
    const inserted = vi.fn(async (input) => ({id: "11111111-1111-4111-8111-111111111111", ...input}));
    const audited = vi.fn(async () => undefined);
    const dependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: inserted, lockEvent: vi.fn(), updateEvent: vi.fn(), lockActiveMedia: vi.fn(), insertAudit: audited})};
    await expect(createEvent(member("profile-member"), createInput, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(createEvent(staff, createInput, dependencies)).resolves.toMatchObject({slug: "member-mixer"});
    expect(audited).toHaveBeenCalledWith(expect.objectContaining({actorUserId: "profile-staff", action: "event.created", targetType: "event"}));
  });

  it("serializes capacity decisions and deterministically waitlists overflow registrations", async () => {
    const registrations = new Map<string, "registered" | "waitlist" | "cancelled">();
    const audits: unknown[] = [];
    const dependencies: EventRegistrationDependencies = {now: () => new Date("2099-01-01T00:00:00.000Z"), transaction: async (work) => work({lockEvent: async () => eventLock, hasEligibleMembership: async () => true, getRegistration: async (_eventId, profileId) => registrations.has(profileId) ? {status: registrations.get(profileId)!} : null, countRegistered: async () => [...registrations.values()].filter((status) => status === "registered").length, upsertRegistration: async (_eventId, profileId, status) => { registrations.set(profileId, status); }, insertAudit: async (input) => { audits.push(input); }})};
    await expect(registerForEvent(member("profile-a"), {eventId: eventLock.id}, dependencies)).resolves.toMatchObject({disposition: "registered"});
    await expect(registerForEvent(member("profile-b"), {eventId: eventLock.id}, dependencies)).resolves.toMatchObject({disposition: "waitlist"});
    await expect(registerForEvent(member("profile-a"), {eventId: eventLock.id}, dependencies)).resolves.toMatchObject({disposition: "already_registered"});
    expect(registrations.get("profile-a")).toBe("registered");
    expect(registrations.get("profile-b")).toBe("waitlist");
    expect(audits).toHaveLength(2);
  });

  it("checks Event closure before membership under the row lock", async () => {
    const membership = vi.fn(async () => false);
    const dependencies: EventRegistrationDependencies = {now: () => new Date("2100-01-01T00:00:00.000Z"), transaction: async (work) => work({lockEvent: async () => eventLock, hasEligibleMembership: membership, getRegistration: async () => null, countRegistered: async () => 0, upsertRegistration: async () => undefined, insertAudit: async () => undefined})};
    await expect(registerForEvent(member("profile-expired"), {eventId: eventLock.id}, dependencies)).rejects.toThrow("EVENT_REGISTRATION_CLOSED");
    expect(membership).not.toHaveBeenCalled();
  });

  it("rejects Event updates whose resulting end is not after the start", async () => {
    const current = {id: eventLock.id, ...createInput, startsAt: new Date(createInput.startsAt), endsAt: new Date(createInput.endsAt), createdAt: new Date(), updatedAt: new Date()};
    const update = vi.fn();
    const dependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: vi.fn(), lockEvent: async () => current, updateEvent: update, lockActiveMedia: vi.fn(), insertAudit: vi.fn()})};
    await expect(updateEvent(staff, current.id, {endsAt: "2099-09-01T09:00:00.000Z"}, dependencies)).rejects.toThrow("endsAt must be after startsAt");
    expect(update).not.toHaveBeenCalled();
  });
});
