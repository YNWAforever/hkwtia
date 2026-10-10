import "server-only";

import {sql} from "drizzle-orm";
import {z} from "zod";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {forbidden, getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {contacts, joinInvites, profiles} from "@/lib/db/server-schema";

/**
 * Phase E, Task 9. What the daily digest reads, in one place.
 *
 * Read-only and cron-only: the digest is composed by the `lead-reminders` job,
 * not by a signed-in admin, so the gate is the automation-cron actor (the same
 * one `staff-alert-recipients` uses) and not `requireAdmin`. Recipients come
 * from the same role set as the worker alert: staff, exco and superadmin.
 */
export type LeadReminderRecipient = Readonly<{
  profileId: string;
  email: string;
  displayName: string;
  locale: "en" | "zh-HK";
}>;

export type LeadReminderLead = Readonly<{
  id: string;
  displayName: string;
  ownerProfileId: string | null;
  nextStep: string | null;
  nextStepDueAt: Date | null;
}>;

export type LeadReminderInvite = Readonly<{
  contactId: string;
  displayName: string;
  ownerProfileId: string | null;
  openedAt: Date;
}>;

export type LeadReminderInputs = Readonly<{
  recipients: readonly LeadReminderRecipient[];
  leads: readonly LeadReminderLead[];
  staleInvites: readonly LeadReminderInvite[];
}>;

/** A bound on one run, not a product limit: far above any real pipeline, so a runaway table cannot exhaust the job. */
const READ_CAP = 2000;

const recipientRow = z.object({
  profile_id: z.string(),
  email: z.string().trim().email().max(320),
  display_name: z.string(),
  locale: z.string().nullable(),
});
const leadRow = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  owner_profile_id: z.string().nullable(),
  next_step: z.string().nullable(),
  next_step_due_at: z.coerce.date().nullable(),
});
const inviteRow = z.object({
  contact_id: z.string(),
  display_name: z.string().nullable(),
  owner_profile_id: z.string().nullable(),
  opened_at: z.coerce.date(),
});

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

function requireCron(actor: AutomationRepositoryActor): void {
  requireAutomationSystem(actor);
  if (actor.source !== "automation-cron") forbidden();
}

export function createLeadRemindersRepository(loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader) {
  return {
    async load(actor: AutomationRepositoryActor, now: Date): Promise<LeadReminderInputs> {
      requireCron(actor);
      if (!Number.isFinite(now.getTime())) throw new Error("INVALID_REMINDER_CLOCK");
      const database = await loadDatabase();
      const staleBefore = new Date(now.getTime() - 3 * 86_400_000);

      const recipients = rowsFrom(await database.execute(sql`
        SELECT p.id AS profile_id, lower(trim(p.email)) AS email, p.display_name, p.locale
        FROM ${profiles} p
        WHERE p.role IN (${"staff"}, ${"exco"}, ${"superadmin"})
          AND p.email IS NOT NULL AND length(trim(p.email)) > 0
        ORDER BY p.id
      `)).flatMap((row) => {
        const parsed = recipientRow.safeParse(row);
        return parsed.success
          ? [{
            profileId: parsed.data.profile_id,
            email: parsed.data.email.toLowerCase(),
            displayName: parsed.data.display_name,
            locale: parsed.data.locale === "zh-HK" ? "zh-HK" as const : "en" as const,
          }]
          : [];
      });

      // Open leads only: a member or a closed lead has no next step worth chasing.
      // Owned leads need a dated step to matter; unowned ones are listed whatever
      // their step, because "nobody owns this" is itself what the digest flags.
      const leads = rowsFrom(await database.execute(sql`
        SELECT c.id, c.display_name, c.owner_profile_id, c.next_step, c.next_step_due_at
        FROM ${contacts} c
        WHERE c.stage NOT IN ('member', 'closed')
          AND (c.owner_profile_id IS NULL OR c.next_step_due_at IS NOT NULL)
        ORDER BY c.next_step_due_at ASC NULLS LAST, c.created_at ASC, c.id ASC
        LIMIT ${READ_CAP}
      `)).map((row) => {
        const parsed = leadRow.parse(row);
        return {
          id: parsed.id,
          displayName: parsed.display_name ?? "",
          ownerProfileId: parsed.owner_profile_id,
          nextStep: parsed.next_step,
          nextStepDueAt: parsed.next_step_due_at,
        };
      });

      const staleInvites = rowsFrom(await database.execute(sql`
        SELECT i.contact_id, c.display_name, c.owner_profile_id, i.opened_at
        FROM ${joinInvites} i
        JOIN ${contacts} c ON c.id = i.contact_id
        WHERE i.opened_at IS NOT NULL AND i.opened_at < ${staleBefore}
          AND i.consumed_at IS NULL AND i.application_id IS NULL AND i.superseded_at IS NULL
          AND c.stage NOT IN ('member', 'closed')
        ORDER BY i.opened_at ASC, i.id ASC
        LIMIT ${READ_CAP}
      `)).map((row) => {
        const parsed = inviteRow.parse(row);
        return {
          contactId: parsed.contact_id,
          displayName: parsed.display_name ?? "",
          ownerProfileId: parsed.owner_profile_id,
          openedAt: parsed.opened_at,
        };
      });

      return {recipients, leads, staleInvites};
    },
  };
}

export type LeadRemindersRepository = ReturnType<typeof createLeadRemindersRepository>;
export const leadRemindersRepository = createLeadRemindersRepository();
