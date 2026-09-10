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
     * Two guarded halves and one audit row, the shape `contactsRepository
     * .markWhatsAppOptedOut` uses. EITHER half being new is a consent change,
     * and the row is written when either is.
     *
     * The idempotency this buys is what Task 4 Step 7's rationale assumed and
     * this leg did not have: `lib/ai/woztell-production.ts:recordOptOut` runs
     * this leg in its own transaction and THEN the contact leg in another, and
     * the webhook route 500s on a throw — so a failure in the second leg makes
     * Woztell redeliver the same STOP, and an unguarded UPDATE plus an
     * unconditional INSERT wrote a second `consent.whatsapp.revoked` row for a
     * withdrawal already recorded. On that redelivery neither half is new: the
     * webhook cleared `whatsapp_opt_in` itself before calling
     * (`lib/ai/woztell-webhook.ts` opt_out branch) and
     * `message_suppressions_profile_channel_classification_unique` conflicts.
     *
     * A review caught the first attempt at this, which keyed the audit on the
     * suppression INSERT alone. Nothing in the tree DELETEs a suppression
     * outside the seeds, while a re-consent path already ships — the portal
     * profile form writes `whatsapp_opt_in = true` through
     * `lib/portal/command-core.ts` — so a member who re-granted and then
     * withdrew again through `/api/unsubscribe?channel=whatsapp` had the flag
     * cleared here (a real, member-initiated withdrawal) and got no audit row
     * and no new suppression: no trace at all, breaking boundary 11. Hence the
     * guard on the UPDATE rather than a guard on the INSERT: the flag
     * TRANSITION is the second, independent evidence of newness, and the
     * metadata says which half spoke.
     *
     * The guard costs the UPDATE its second job as an existence check, and
     * `lib/api/unsubscribe-route.ts` turns PROFILE_NOT_FOUND into a 404 for a
     * token that verifies but names nobody — hence the lookup, which runs only
     * when the guard missed. Two concurrent STOPs serialise on the row lock and
     * the loser re-evaluates its guard after the winner commits, so exactly one
     * of them clears the flag; a self-join returning the OLD value in one
     * statement would read its pre-lock snapshot and audit twice.
     */
    async optOutWhatsApp(
      actor: Actor | UnsubscribeActor,
      profileId: string,
      reasonCode: string,
    ): Promise<"created" | "existing"> {
      requireSuppressionActor(actor);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const cleared = rowsFrom(await transaction.execute(sql`
          UPDATE ${profiles}
          SET whatsapp_opt_in = false, updated_at = now()
          WHERE id = ${profileId} AND ${profiles.whatsappOptIn} = true
          RETURNING id
        `))[0];
        if (!cleared) {
          const profile = rowsFrom(await transaction.execute(sql`
            SELECT ${profiles.id} AS id FROM ${profiles} WHERE ${profiles.id} = ${profileId}
          `))[0];
          if (!profile) throw new Error("PROFILE_NOT_FOUND");
        }
        const suppression = rowsFrom(await transaction.execute(sql`
          INSERT INTO ${messageSuppressions}
            (profile_id, channel, classification, reason_code)
          VALUES (${profileId}, 'whatsapp', 'marketing', ${reasonCode})
          ON CONFLICT DO NOTHING
          RETURNING id
        `))[0];
        if (!cleared && !suppression) return "existing";
        await transaction.execute(sql`
          INSERT INTO ${auditEvents}
            (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (
            NULL, ${actor.kind}, 'consent.whatsapp.revoked', 'profile', ${profileId},
            ${JSON.stringify({
              reasonCode,
              clearedOptIn: cleared !== undefined,
              suppressionCreated: suppression !== undefined,
            })}::jsonb
          )
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
