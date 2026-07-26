import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {getDb, forbidden} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {profiles} from "@/lib/db/server-schema";

const addressSchema = z.string().trim().email().max(320);

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

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function requireAutomationCron(actor: AutomationRepositoryActor): void {
  requireAutomationSystem(actor);
  if (actor.source !== "automation-cron") forbidden();
}

export function createStaffAlertRecipientsRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async listCurrent(actor: AutomationRepositoryActor): Promise<readonly string[]> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      const result = await database.execute(sql`
        SELECT lower(trim(${profiles.email})) AS email FROM ${profiles}
        WHERE ${profiles.role} IN (${"staff"}, ${"exco"}, ${"superadmin"})
          AND ${profiles.email} IS NOT NULL
          AND length(trim(${profiles.email})) > 0
        ORDER BY lower(trim(${profiles.email}))
      `);
      const addresses = rowsFrom(result).flatMap((row) => {
        const parsed = addressSchema.safeParse(row.email);
        return parsed.success ? [parsed.data.toLowerCase()] : [];
      });
      return [...new Set(addresses)].sort();
    },
  };
}

export type StaffAlertRecipientsRepository =
  ReturnType<typeof createStaffAlertRecipientsRepository>;

export const staffAlertRecipientsRepository =
  createStaffAlertRecipientsRepository();
