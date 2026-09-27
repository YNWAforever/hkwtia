import {z} from "zod";
import {createAttendeesCsvGet} from "@/lib/admin/event-attendees";
import {requireAdminActor} from "@/lib/auth/actor";
import {auditEventsRepository} from "@/lib/db/repos/audit-events";
import {eventsRepository} from "@/lib/db/repos/events";

export const dynamic = "force-dynamic";

// The session and database are wired here, not in lib/admin/event-attendees.ts,
// so that module stays importable by the unit test without `@/lib/auth/actor`
// pulling `authEnv()` in at module scope (CLAUDE.md boundary 4).
const legacyGet = createAttendeesCsvGet({
  actor: requireAdminActor,
  list: (actor, eventId) => eventsRepository.listAttendees(actor, eventId),
  audit: async (actor, eventId, rowCount) => {
    await auditEventsRepository.append(actor, {action: "event.attendees.exported", targetType: "event", targetId: eventId, metadata: {rowCount}});
  },
});

/** Existing bookmarks enter the durable preview after the background capability is enabled. */
export async function GET(request:Request,context:Readonly<{params:Promise<{id:string}>}>):Promise<Response>{
  if(process.env.ADMIN_BATCH_ENABLED!=="true"||process.env.EVENT_ATTENDEE_EXPORT_ENABLED!=="true")return legacyGet(request,context);
  const actor=await requireAdminActor().catch(()=>null);if(!actor)return new Response(null,{status:404});
  const id=z.string().uuid().safeParse((await context.params).id);if(!id.success)return new Response(null,{status:404});
  return new Response(null,{status:303,headers:{Location:`/admin/events-mgmt/${id.data}?tab=attendees`,"Cache-Control":"private, no-store"}});
}
