import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {auditEvents, contactActivities, contacts, profiles} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader, AutomationSqlExecutor} from "@/lib/db/repos/journeys";
import {getDb} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

/**
 * Phase E lead pipeline: the per-contact timeline an admin reads on the
 * contact page. Mirrors `contactActivityKindEnum` in the schema; a new kind is
 * a migration, so the list lives next to the schema rather than being inferred.
 */
export const CONTACT_ACTIVITY_KINDS = [
  "note",
  "stage_change",
  "owner_change",
  "next_step",
  "invite_sent",
  "invite_opened",
  "applied",
  "became_member",
] as const;
export type ContactActivityKind = (typeof CONTACT_ACTIVITY_KINDS)[number];

export type ContactActivity = Readonly<{
  id: string;
  contactId: string;
  actorProfileId: string | null;
  actorName: string | null;
  kind: ContactActivityKind;
  body: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
}>;

const contactIdSchema = z.string().uuid();
const noteBodySchema = z.string().trim().min(1).max(2000);

const activityRowSchema = z.object({
  id: z.string(),
  contact_id: z.string(),
  actor_profile_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  kind: z.enum(CONTACT_ACTIVITY_KINDS),
  body: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable().transform((value) => value ?? {}),
  created_at: z.coerce.date(),
});

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

function toActivity(row: Record<string, unknown>): ContactActivity {
  const parsed = activityRowSchema.parse(row);
  return {
    id: parsed.id,
    contactId: parsed.contact_id,
    actorProfileId: parsed.actor_profile_id,
    actorName: parsed.actor_name,
    kind: parsed.kind,
    body: parsed.body,
    meta: parsed.meta,
    createdAt: parsed.created_at,
  };
}

/**
 * The shared SQL write. It takes the caller's `transaction` so the timeline row
 * commits with the change it describes (a stage move, an owner move, an invite)
 * or not at all — an activity written outside that transaction could record a
 * change that was rolled back. It performs NO authorization: the calling
 * repository has already run `requireAdmin` (or, for automated writers such as
 * the join-invite flow, holds its own capability).
 */
export async function insertContactActivity(
  transaction: AutomationSqlExecutor,
  input: Readonly<{
    contactId: string;
    actorProfileId: string | null;
    kind: ContactActivityKind;
    body?: string | null;
    meta?: Record<string, unknown>;
  }>,
): Promise<void> {
  await transaction.execute(sql`
    INSERT INTO ${contactActivities} (contact_id, actor_profile_id, kind, body, meta)
    VALUES (
      ${input.contactId}, ${input.actorProfileId}, ${input.kind}, ${input.body ?? null},
      ${JSON.stringify(input.meta ?? {})}::jsonb
    )
  `);
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

export function createContactActivitiesRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    /** Newest first; the actor's name is joined so the timeline needs no second read. */
    async list(actor: Actor, contactId: unknown): Promise<readonly ContactActivity[]> {
      requireAdmin(actor);
      const id = contactIdSchema.parse(contactId);
      const database = await loadDatabase();
      const rows = rowsFrom(await database.execute(sql`
        SELECT a.id, a.contact_id, a.actor_profile_id, p.display_name AS actor_name,
               a.kind, a.body, a.meta, a.created_at
        FROM ${contactActivities} a
        LEFT JOIN ${profiles} p ON p.id = a.actor_profile_id
        WHERE a.contact_id = ${id}
        ORDER BY a.created_at DESC, a.id DESC
      `));
      return rows.map(toActivity);
    },

    /**
     * A note is a touch, so it also moves `last_touch_at`; the UPDATE runs first
     * and doubles as the existence check (no row, no activity, no orphan FK
     * error). Activity, touch and audit commit together.
     */
    async addNote(actor: Actor, contactId: unknown, body: unknown): Promise<ContactActivity> {
      requireAdmin(actor);
      const id = contactIdSchema.parse(contactId);
      const text = noteBodySchema.parse(body);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const touched = rowsFrom(await transaction.execute(sql`
          UPDATE ${contacts} SET last_touch_at = now(), updated_at = now()
          WHERE ${contacts.id} = ${id}
          RETURNING ${contacts.id} AS id
        `))[0];
        if (!touched) throw new Error("CONTACT_NOT_FOUND");

        const row = rowsFrom(await transaction.execute(sql`
          WITH inserted AS (
            INSERT INTO ${contactActivities} (contact_id, actor_profile_id, kind, body, meta)
            VALUES (${id}, ${actor.profileId}, 'note', ${text}, '{}'::jsonb)
            RETURNING id, contact_id, actor_profile_id, kind, body, meta, created_at
          )
          SELECT inserted.id, inserted.contact_id, inserted.actor_profile_id,
                 p.display_name AS actor_name, inserted.kind, inserted.body,
                 inserted.meta, inserted.created_at
          FROM inserted
          LEFT JOIN ${profiles} p ON p.id = inserted.actor_profile_id
        `))[0];
        if (!row) throw new Error("CONTACT_ACTIVITY_NOT_WRITTEN");

        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            ${actor.profileId}, ${actor.kind}, 'contact.note_added', 'contact', ${id},
            ${JSON.stringify({length: text.length})}::jsonb
          )
        `);
        return toActivity(row);
      });
    },
  };
}

export const contactActivitiesRepository = createContactActivitiesRepository();
