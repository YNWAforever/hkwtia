import {describe, expect, it, vi} from "vitest";

import {checkInAttendee, type CheckInDependencies} from "@/lib/admin/events";
import type {Actor} from "@/lib/membership/lifecycle";

const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const member: Actor = {kind: "member", userId: "auth-member", profileId: "profile-member"};
const input = {
  eventId: "11111111-1111-4111-8111-111111111111",
  profileId: "profile-member",
  occurredAt: new Date("2026-07-20T10:00:00.000Z"),
};

describe("event attendee check-in", () => {
  it("awards attendance points exactly once across repeated check-in", async () => {
    const store = {
      registration: {status: "registered" as "registered" | "attended", checkedInAt: null as Date | null},
      engagementEvents: [] as unknown[],
      audits: [] as unknown[],
    };
    const dependencies: CheckInDependencies = {transaction: async (work) => work({
      lockRegistration: async () => ({...store.registration}),
      markAttended: async (_eventId, _profileId, checkedInAt) => { store.registration = {status: "attended", checkedInAt}; },
      insertEngagement: async (event) => { store.engagementEvents.push(event); },
      insertAudit: async (event) => { store.audits.push(event); },
    })};

    await expect(checkInAttendee(staff, input, dependencies)).resolves.toMatchObject({disposition: "checked_in"});
    await expect(checkInAttendee(staff, input, dependencies)).resolves.toMatchObject({disposition: "already_checked_in"});
    expect(store.engagementEvents).toHaveLength(1);
    expect(store.engagementEvents[0]).toMatchObject({
      profileId: "profile-member",
      type: "event_attended",
      metadata: {registrationKey: "11111111-1111-4111-8111-111111111111:profile-member"},
    });
    expect(store.audits).toHaveLength(1);
  });

  it("rejects non-admins and invalid identifiers before opening a transaction", async () => {
    const transaction = vi.fn();
    const dependencies: CheckInDependencies = {transaction};
    await expect(checkInAttendee(member, input, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(checkInAttendee(staff, {...input, eventId: "not-a-uuid"}, dependencies)).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not commit the registration when the audit insert fails", async () => {
    let committed = false;
    const dependencies: CheckInDependencies = {transaction: async (work) => {
      const result = await work({
        lockRegistration: async () => ({status: "registered", checkedInAt: null}),
        markAttended: async () => undefined,
        insertEngagement: async () => undefined,
        insertAudit: async () => { throw new Error("AUDIT_FAILED"); },
      });
      committed = true;
      return result;
    }};
    await expect(checkInAttendee(staff, input, dependencies)).rejects.toThrow("AUDIT_FAILED");
    expect(committed).toBe(false);
  });
});
