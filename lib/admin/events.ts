import "server-only";

import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {createCheckInDependencies, type CheckInDependencies} from "@/lib/db/repos/event-check-in";
import type {Actor} from "@/lib/membership/lifecycle";

const checkInSchema = z.object({
  eventId: z.string().uuid(),
  profileId: z.string().min(1).max(200),
  occurredAt: z.coerce.date().optional(),
  points: z.number().int().min(0).max(10_000).optional().default(5),
}).strict();

export type {CheckInDependencies} from "@/lib/db/repos/event-check-in";

export type CheckInAttendeeDisposition = "checked_in" | "already_checked_in" | "event_cancelled";

/**
 * Phase D-4d whole-branch finding: the member/RSVP door admitted a cancelled
 * event. `checkInAttendee` locked only the registration and never read the
 * event, so staff could still mark members attended and award `event_attended`
 * points after an event was cancelled. The ticket path refuses a cancelled
 * event at both its loader and its write; this is the other door.
 *
 * The refusal is server-side because the Server Action is a published HTTP
 * endpoint: hiding the control would not stop a direct POST. It is a distinct
 * disposition (not a generic error) so the action can say why, and nothing --
 * not the attendance row, the engagement event, nor the audit -- is written.
 */
export async function checkInAttendee(actor: Actor, input: unknown, dependencies?: CheckInDependencies): Promise<Readonly<{disposition: CheckInAttendeeDisposition}>> {
  requireAdmin(actor);
  const parsed = checkInSchema.parse(input);
  const occurredAt = parsed.occurredAt ?? new Date();
  const registrationKey = `${parsed.eventId}:${parsed.profileId}`;
  return (dependencies ?? await createCheckInDependencies()).transaction(async (transaction) => {
    // Event first, then registration: the order `registerForEvent` takes, so a
    // concurrent registration and check-in cannot deadlock, and a cancel (which
    // locks the event) serializes against this read.
    const event = await transaction.lockEvent(parsed.eventId);
    if (event?.status === "cancelled") return {disposition: "event_cancelled"};
    const registration = await transaction.lockRegistration(parsed.eventId, parsed.profileId);
    if (!registration || registration.status === "cancelled" || registration.status === "waitlist") throw new Error("REGISTRATION_NOT_FOUND");
    if (registration.checkedInAt) return {disposition: "already_checked_in"};
    await transaction.markAttended(parsed.eventId, parsed.profileId, occurredAt);
    await transaction.insertEngagement({profileId: parsed.profileId, companyId: null, type: "event_attended", points: parsed.points, metadata: {registrationKey}, occurredAt});
    await transaction.insertAudit({actorUserId: actor.profileId, actorType: actor.kind, action: "event.attendee.checked_in", targetType: "event_registration", targetId: registrationKey, metadata: {eventId: parsed.eventId, profileId: parsed.profileId}});
    return {disposition: "checked_in"};
  });
}
