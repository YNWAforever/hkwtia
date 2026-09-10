import "server-only";

import {sql} from "drizzle-orm";

import {auditEvents, messageSuppressions, profiles} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb, requireSystem} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

const unsubscribeCapability: unique symbol = Symbol("unsubscribe-capability");

export type UnsubscribeActor = Readonly<{
  kind: "unsubscribe";
  userId: null;
  [unsubscribeCapability]: true;
}>;

export function unsubscribeActor(): UnsubscribeActor {
  return Object.freeze({kind: "unsubscribe", userId: null, [unsubscribeCapability]: true as const});
}

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function isUnsubscribeActor(actor: Actor | UnsubscribeActor): actor is UnsubscribeActor {
  return actor.kind === "unsubscribe" && actor[unsubscribeCapability] === true;
}

function requireSuppressionActor(actor: Actor | UnsubscribeActor): void {
  if (isUnsubscribeActor(actor)) return;
  requireSystem(actor);
}

export function createSuppressionsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async unsubscribeEmailMarketing(
      actor: Actor | UnsubscribeActor,
      profileId: string,
      reasonCode: string,
    ): Promise<"created" | "existing"> {
      requireSuppressionActor(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const profile = rowsFrom(await transaction.execute(sql`
          UPDATE ${profiles}
          SET consent_marketing = false, updated_at = now()
          WHERE id = ${profileId}
          RETURNING id
        `))[0];
        if (!profile) throw new Error("PROFILE_NOT_FOUND");
        const suppression = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messageSuppressions}
            (profile_id, channel, classification, reason_code)
          VALUES (${profileId}, 'email', 'marketing', ${reasonCode})
          ON CONFLICT DO NOTHING
          RETURNING id
        `))[0];
        return suppression ? "created" : "existing";
      });
    },

    /**
     * STOP / 取消 on WhatsApp, or channel=whatsapp on /api/unsubscribe. Writes
     * the suppression, clears the profile flag and audits it in one transaction
     * (programme D-7). A prospect with no profile is handled by
     * contactsRepository.markWhatsAppOptedOut instead.
     *
     * C-1 review fix: the audit row is written only when the suppression INSERT
     * actually created one. `lib/ai/woztell-production.ts:recordOptOut` runs
     * this leg in its own transaction and THEN the contact leg in another, and
     * the webhook route 500s on a throw — so a failure in the second leg makes
     * Woztell redeliver the same STOP and, unguarded, this leg wrote a second
     * `consent.whatsapp.revoked` row for a withdrawal it had already recorded.
     * The plan's Task 4 Step 7 rationale claims both legs are idempotent; this
     * is the half that was not. `message_suppressions_profile_channel_classification_unique`
     * makes the INSERT the idempotency key, and it is the right one: a repeat
     * STOP from someone already suppressed is not a new consent change. If
     * C-4's re-consent flow (O-4) ever grants WhatsApp back it must DELETE this
     * row, or a later withdrawal would find it still there and go unaudited.
     */
    async optOutWhatsApp(
      actor: Actor | UnsubscribeActor,
      profileId: string,
      reasonCode: string,
    ): Promise<"created" | "existing"> {
      requireSuppressionActor(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const profile = rowsFrom(await transaction.execute(sql`
          UPDATE ${profiles}
          SET whatsapp_opt_in = false, updated_at = now()
          WHERE id = ${profileId}
          RETURNING id
        `))[0];
        if (!profile) throw new Error("PROFILE_NOT_FOUND");
        const suppression = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messageSuppressions}
            (profile_id, channel, classification, reason_code)
          VALUES (${profileId}, 'whatsapp', 'marketing', ${reasonCode})
          ON CONFLICT DO NOTHING
          RETURNING id
        `))[0];
        if (!suppression) return "existing";
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (NULL, ${actor.kind}, 'consent.whatsapp.revoked', 'profile', ${profileId}, ${JSON.stringify({reasonCode})}::jsonb)
        `);
        return "created";
      });
    },
  };
}

export type SuppressionsRepository = ReturnType<typeof createSuppressionsRepository>;
export const suppressionsRepository = createSuppressionsRepository();
export const suppressionsRepo = suppressionsRepository;
export const suppressions = suppressionsRepository;
