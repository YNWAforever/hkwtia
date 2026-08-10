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

export async function checkInAttendee(actor: Actor, input: unknown, dependencies?: CheckInDependencies): Promise<Readonly<{disposition: "checked_in" | "already_checked_in"}>> {
  requireAdmin(actor);
  const parsed = checkInSchema.parse(input);
  const occurredAt = parsed.occurredAt ?? new Date();
  const registrationKey = `${parsed.eventId}:${parsed.profileId}`;
  return (dependencies ?? await createCheckInDependencies()).transaction(async (transaction) => {
    const registration = await transaction.lockRegistration(parsed.eventId, parsed.profileId);
    if (!registration || registration.status === "cancelled" || registration.status === "waitlist") throw new Error("REGISTRATION_NOT_FOUND");
    if (registration.checkedInAt) return {disposition: "already_checked_in"};
    await transaction.markAttended(parsed.eventId, parsed.profileId, occurredAt);
    await transaction.insertEngagement({profileId: parsed.profileId, companyId: null, type: "event_attended", points: parsed.points, metadata: {registrationKey}, occurredAt});
    await transaction.insertAudit({actorUserId: actor.profileId, actorType: actor.kind, action: "event.attendee.checked_in", targetType: "event_registration", targetId: registrationKey, metadata: {eventId: parsed.eventId, profileId: parsed.profileId}});
    return {disposition: "checked_in"};
  });
}
