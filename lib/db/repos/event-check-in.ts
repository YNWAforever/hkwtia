import "server-only";

import {and, eq} from "drizzle-orm";

import {getDb} from "@/lib/db/repos/common";
import {auditEvents, engagementEvents, eventRegistrations} from "@/lib/db/server-schema";
import type {AdminActor} from "@/lib/membership/lifecycle";

type CheckInAudit = Readonly<{actorUserId: string; actorType: AdminActor["kind"]; action: "event.attendee.checked_in"; targetType: "event_registration"; targetId: string; metadata: Readonly<{eventId: string; profileId: string}>}>;
type CheckInEngagement = Readonly<{profileId: string; companyId: null; type: "event_attended"; points: number; metadata: Readonly<{registrationKey: string}>; occurredAt: Date}>;
export type CheckInDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  lockRegistration: (eventId: string, profileId: string) => Promise<Readonly<{status: string; checkedInAt: Date | null}> | null>;
  markAttended: (eventId: string, profileId: string, checkedInAt: Date) => Promise<void>;
  insertEngagement: (input: CheckInEngagement) => Promise<void>;
  insertAudit: (input: CheckInAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

export async function createCheckInDependencies(): Promise<CheckInDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    lockRegistration: async (eventId, profileId) => (await tx.select({status: eventRegistrations.status, checkedInAt: eventRegistrations.checkedInAt}).from(eventRegistrations)
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.profileId, profileId))).for("update"))[0] ?? null,
    markAttended: async (eventId, profileId, checkedInAt) => { await tx.update(eventRegistrations).set({status: "attended", checkedInAt}).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.profileId, profileId))); },
    insertEngagement: async (input) => { await tx.insert(engagementEvents).values(input); },
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}
