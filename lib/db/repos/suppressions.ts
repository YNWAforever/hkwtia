import "server-only";

import {sql} from "drizzle-orm";

import {messageSuppressions, profiles} from "@/lib/db/server-schema";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {getDb, requireSystem} from "@/lib/db/repos/common";
import type {Actor} from "@/lib/membership/lifecycle";

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

export function createSuppressionsRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async unsubscribeEmailMarketing(
      actor: Actor,
      profileId: string,
      reasonCode: string,
    ): Promise<"created" | "existing"> {
      requireSystem(actor);
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
  };
}

export type SuppressionsRepository = ReturnType<typeof createSuppressionsRepository>;
export const suppressionsRepository = createSuppressionsRepository();
export const suppressionsRepo = suppressionsRepository;
export const suppressions = suppressionsRepository;
