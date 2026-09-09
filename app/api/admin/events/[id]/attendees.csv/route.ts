import {createAttendeesCsvGet} from "@/lib/admin/event-attendees";
import {requireAdminActor} from "@/lib/auth/actor";
import {auditEventsRepository} from "@/lib/db/repos/audit-events";
import {eventsRepository} from "@/lib/db/repos/events";

export const dynamic = "force-dynamic";

// The session and database are wired here, not in lib/admin/event-attendees.ts,
// so that module stays importable by the unit test without `@/lib/auth/actor`
// pulling `authEnv()` in at module scope (CLAUDE.md boundary 4).
export const GET = createAttendeesCsvGet({
  actor: requireAdminActor,
  list: (actor, eventId) => eventsRepository.listAttendees(actor, eventId),
  audit: async (actor, eventId, rowCount) => {
    await auditEventsRepository.append(actor, {action: "event.attendees.exported", targetType: "event", targetId: eventId, metadata: {rowCount}});
  },
});
