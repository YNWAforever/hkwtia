import "server-only";

import {z} from "zod";

import {csvCell} from "@/lib/admin/csv";
import {requireAdmin} from "@/lib/auth/authorize";
import type {EventAttendee} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const eventIdSchema = z.string().uuid();
const header = ["kind", "name", "email", "organisation", "status", "checked_in_at"] as const;

/**
 * Door list for one event (programme B-4). Same envelope as `encodeMemberCsv`
 * — BOM, CRLF, formula-neutralised cells — because staff open both in Excel and
 * guest names are free text typed by the public.
 */
export function attendeesCsv(rows: readonly EventAttendee[]): string {
  const lines = rows.map((row) => [row.kind, row.displayName, row.email, row.organisation, row.status, row.checkedInAt ? row.checkedInAt.toISOString() : null].map(csvCell).join(","));
  return `\uFEFF${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

export type AttendeesCsvDependencies = Readonly<{
  /** Resolves the session; rejects when there is none. Wired to `requireAdminActor` by the route. */
  actor: () => Promise<Actor>;
  /** `null` means the event id does not exist; the route 404s before auditing. */
  list: (actor: Actor, eventId: string) => Promise<readonly EventAttendee[] | null>;
  /** Writes the `event.attendees.exported` audit row; awaited before any byte leaves. */
  audit: (actor: Actor, eventId: string, rowCount: number) => Promise<void>;
}>;

/**
 * GET handler factory so the unit test drives it without a session or database.
 * Every refusal is a 404 rather than a 401/403 so the route does not confirm
 * which event ids exist to someone probing without a staff session.
 */
export function createAttendeesCsvGet(deps: AttendeesCsvDependencies) {
  return async function GET(_request: Request, context: Readonly<{params: Promise<{id: string}>}>): Promise<Response> {
    let actor: Actor;
    try {
      actor = await deps.actor();
      requireAdmin(actor);
    } catch {
      return new Response("Not found", {status: 404});
    }
    const parsed = eventIdSchema.safeParse((await context.params).id);
    if (!parsed.success) return new Response("Not found", {status: 404});
    const rows = await deps.list(actor, parsed.data);
    // `null` means the event id doesn't exist: 404 before auditing so there's
    // no `event.attendees.exported` row for a target that was never real.
    if (rows === null) return new Response("Not found", {status: 404});
    // Guest emails leave the system here, so the audit row is part of the
    // export, not a best-effort side effect: no audit, no file.
    await deps.audit(actor, parsed.data, rows.length);
    return new Response(attendeesCsv(rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="attendees-${parsed.data}.csv"`,
        "cache-control": "no-store",
      },
    });
  };
}
