import {describe, expect, it, vi} from "vitest";

import {createEvent, registerForEvent, updateEvent, type EventMutationDependencies, type EventRegistrationDependencies} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member = (profileId: string): Actor => ({kind: "member", userId: `auth-${profileId}`, profileId});
const createInput = {slug: "member-mixer", titleEn: "Member mixer", titleZh: "\u6703\u54e1\u4ea4\u6d41\u6703", descriptionEn: "Meet the community.", descriptionZh: "\u8207\u793e\u7fa4\u4ea4\u6d41\u3002", startsAt: "2099-09-01T10:00:00.000Z", endsAt: "2099-09-01T12:00:00.000Z", venue: "WTIA", capacity: 1, memberOnly: true, published: true};

describe("admin event mutations and registration capacity", () => {
  it("requires an admin and appends the audit in the same create transaction", async () => {
    const inserted = vi.fn(async (input) => ({id: "11111111-1111-4111-8111-111111111111", ...input}));
    const audited = vi.fn(async () => undefined);
    const dependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: inserted, lockEvent: vi.fn(), updateEvent: vi.fn(), insertAudit: audited})};
    await expect(createEvent(member("profile-member"), createInput, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(createEvent(staff, createInput, dependencies)).resolves.toMatchObject({slug: "member-mixer"});
    expect(audited).toHaveBeenCalledWith(expect.objectContaining({actorUserId: "profile-staff", action: "event.created", targetType: "event"}));
  });

  it("serializes capacity decisions and deterministically waitlists overflow registrations", async () => {
    const registrations = new Map<string, "registered" | "waitlist" | "cancelled">();
    const audits: unknown[] = [];
    const dependencies: EventRegistrationDependencies = {transaction: async (work) => work({
      lockEvent: async () => ({id: "11111111-1111-4111-8111-111111111111", capacity: 1, published: true}),
      hasEligibleMembership: async () => true,
      getRegistration: async (_eventId, profileId) => registrations.has(profileId) ? {status: registrations.get(profileId)!} : null,
      countRegistered: async () => [...registrations.values()].filter((status) => status === "registered").length,
      upsertRegistration: async (_eventId, profileId, status) => { registrations.set(profileId, status); },
      insertAudit: async (input) => { audits.push(input); },
    })};
    await expect(registerForEvent(member("profile-a"), {eventId: "11111111-1111-4111-8111-111111111111"}, dependencies)).resolves.toMatchObject({disposition: "registered"});
    await expect(registerForEvent(member("profile-b"), {eventId: "11111111-1111-4111-8111-111111111111"}, dependencies)).resolves.toMatchObject({disposition: "waitlist"});
    await expect(registerForEvent(member("profile-a"), {eventId: "11111111-1111-4111-8111-111111111111"}, dependencies)).resolves.toMatchObject({disposition: "already_registered"});
    expect(registrations.get("profile-a")).toBe("registered");
    expect(registrations.get("profile-b")).toBe("waitlist");
    expect(audits).toHaveLength(2);
  });

  it("rejects RSVP when membership became inactive inside the transaction", async () => {
    const upsertRegistration = vi.fn();
    const dependencies: EventRegistrationDependencies = {transaction: async (work) => work({
      lockEvent: async () => ({id: "11111111-1111-4111-8111-111111111111", capacity: 1, published: true}),
      hasEligibleMembership: async () => false, getRegistration: async () => null, countRegistered: async () => 0,
      upsertRegistration, insertAudit: async () => undefined,
    })};
    await expect(registerForEvent(member("profile-expired"), {eventId: "11111111-1111-4111-8111-111111111111"}, dependencies)).rejects.toThrow("MEMBERSHIP_INACTIVE");
    expect(upsertRegistration).not.toHaveBeenCalled();
  });

  it("rejects event updates whose resulting end is not after the start", async () => {
    const current = {id: "11111111-1111-4111-8111-111111111111", ...createInput, startsAt: new Date(createInput.startsAt), endsAt: new Date(createInput.endsAt), createdAt: new Date(), updatedAt: new Date()};
    const update = vi.fn();
    const dependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: vi.fn(), lockEvent: async () => current, updateEvent: update, insertAudit: vi.fn()})};
    await expect(updateEvent(staff, current.id, {endsAt: "2099-09-01T09:00:00.000Z"}, dependencies)).rejects.toThrow("endsAt must be after startsAt");
    expect(update).not.toHaveBeenCalled();
  });
});
