import "server-only";

import {sql} from "drizzle-orm";

import type {WoztellProfile} from "@/lib/ai/woztell-webhook";
import {getDb} from "@/lib/db/repos/common";
import {profiles} from "@/lib/db/server-schema";

type ProfileSqlExecutor = Readonly<{
  execute(query: unknown): Promise<unknown>;
}>;

export type WoztellProfileDatabaseLoader =
  () => Promise<ProfileSqlExecutor>;

function rowsFrom(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result
    && typeof result === "object"
    && "rows" in result
    && Array.isArray(result.rows)
  ) {
    return result.rows as Record<string, unknown>[];
  }
  return [];
}

async function defaultDatabaseLoader(): Promise<ProfileSqlExecutor> {
  return await getDb() as unknown as ProfileSqlExecutor;
}

export function createWoztellProfileResolverRepository(
  loadDatabase: WoztellProfileDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async resolveProfile(
      normalizedSender: string,
    ): Promise<WoztellProfile | null> {
      const database = await loadDatabase();
      const digits = normalizedSender.replace(/\D/g, "");
      const matches = rowsFrom(await database.execute(sql`
        SELECT
          ${profiles.id} AS id,
          ${profiles.displayName} AS display_name,
          ${profiles.locale} AS locale,
          ${profiles.whatsappOptIn} AS whatsapp_opt_in
        FROM ${profiles}
        WHERE regexp_replace(
          COALESCE(${profiles.whatsappNumber}, ''),
          '[^0-9]',
          '',
          'g'
        ) = ${digits}
        ORDER BY ${profiles.id}
        LIMIT 2
      `));
      if (matches.length !== 1) return null;
      const row = matches[0];
      return {
        id: String(row.id),
        displayName: String(row.display_name),
        locale: row.locale === "zh-HK" ? "zh-HK" : "en",
        whatsappOptIn: row.whatsapp_opt_in === true,
      };
    },
  };
}
