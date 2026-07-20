import {describe, expect, it, vi} from "vitest";

import {createEvent, registerForEvent, type EventMutationDependencies, type EventRegistrationDependencies} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member = (profileId: string): Actor => ({kind: "member", userId: `auth-${profileId}`, profileId});

const createInput = {
  slug: "member-mixer",
  titleEn: "Member mixer",
  titleZh: "會員交流會",
  descriptionEn: "Meet the community.",
  descriptionZh: "與社群交流。",
  startsAt: "2099-09-01T10:00:00.000Z",
  endsAt: "2099-09-01T12:00:00.000Z",
  venue: "WTIA",
  capacity: 1,
  memberOnly: true,
  published: true,
};

describe("admin event mutations and registration capacity", () => {
  it("requires an admin and appends the audit in the same create transaction", async () => {
    const inserted = vi.fn(async (input) => ({id: "11111111-1111-4111-8111-111111111111", ...input}));
    const audited = vi.fn(async () => undefined);
    const dependencies: EventMutationDependencies = {transaction: (work) => work({insertEvent: inserted, updateEvent: vi.fn(), insertAudit: audited})};

    await expect(createEvent(member("profile-member"), createInput, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(createEvent(staff, createInput, dependencies)).resolves.toMatchObject({slug: "member-mixer"});
    expect(audited).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "profile-staff",
      action: "event.created",
      targetType: "event",
    }));
  });

  it("serializes capacity decisions and deterministically waitlists overflow registrations", async () => {
    const registrations = new Map<string, "registered" | "waitlist" | "cancelled">();
    const audits: unknown[] = [];
    const dependencies: EventRegistrationDependencies = {transaction: async (work) => work({
      lockEvent: async () => ({id: "11111111-1111-4111-8111-111111111111", capacity: 1, published: true}),
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
});
