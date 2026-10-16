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
      lockEvent: async () => ({status: "published"}),
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
        lockEvent: async () => ({status: "published"}),
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

  // The whole-branch finding: `checkInAttendee` locked only the registration and
  // never read the event, so for a cancelled free/RSVP event staff could still
  // mark a member attended and award `event_attended` points. Ticket seats were
  // already refused at the loader and the write; this is the RSVP door.
  it("refuses a cancelled event's member check-in, writing neither attendance, engagement nor audit", async () => {
    const store = {registration: {status: "registered", checkedInAt: null as Date | null}, attended: 0, engagementEvents: [] as unknown[], audits: [] as unknown[], lockedEvents: 0};
    const dependencies: CheckInDependencies = {transaction: async (work) => work({
      lockEvent: async () => { store.lockedEvents += 1; return {status: "cancelled"}; },
      lockRegistration: async () => ({...store.registration}),
      markAttended: async (_eventId, _profileId, checkedInAt) => { store.attended += 1; store.registration = {status: "attended", checkedInAt}; },
      insertEngagement: async (event) => { store.engagementEvents.push(event); },
      insertAudit: async (event) => { store.audits.push(event); },
    })};

    await expect(checkInAttendee(staff, input, dependencies)).resolves.toEqual({disposition: "event_cancelled"});

    // The event is read to decide, and nothing is written when it is cancelled.
    expect(store.lockedEvents).toBe(1);
    expect(store.attended).toBe(0);
    expect(store.engagementEvents).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  // The pre-existing refusal paths must not move: a cancellation check that ran
  // after the registration check could still admit someone whose registration is
  // cancelled, so both answers are pinned.
  it.each(["cancelled", "waitlist"] as const)("still refuses a %s registration and writes nothing", async (status) => {
    const writes: string[] = [];
    const dependencies: CheckInDependencies = {transaction: async (work) => work({
      lockEvent: async () => ({status: "published"}),
      lockRegistration: async () => ({status, checkedInAt: null}),
      markAttended: async () => { writes.push("attended"); },
      insertEngagement: async () => { writes.push("engagement"); },
      insertAudit: async () => { writes.push("audit"); },
    })};

    await expect(checkInAttendee(staff, input, dependencies)).rejects.toThrow("REGISTRATION_NOT_FOUND");
    expect(writes).toEqual([]);
  });
});
