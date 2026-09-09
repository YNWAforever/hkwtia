import "server-only";

import {sql} from "drizzle-orm";

import {
  requireAutomationSystem,
  type AutomationRepositoryActor,
} from "@/lib/auth/automation-actor";
import {forbidden, getDb} from "@/lib/db/repos/common";
import type {
  AutomationDatabase,
  AutomationDatabaseLoader,
} from "@/lib/db/repos/journeys";
import {
  engagementScores,
  eventRegistrations,
  events,
  memberships,
  messageSuppressions,
  profiles,
} from "@/lib/db/server-schema";
import {
  MEMBERSHIP_STATUSES,
  type MembershipStatus,
} from "@/lib/membership/constants";

export type JobJourneyContextRecord = Readonly<{
  profileId: string;
  email: string | null;
  displayName: string;
  locale: "en" | "zh-HK";
  lastLoginAt: Date | null;
  marketingConsent: boolean;
  profileComplete: boolean;
  whatsappOptIn: boolean;
  whatsappNumber: string | null;
  emailSuppressed: boolean;
  engagementScore: number | null;
  membershipStatus: MembershipStatus | null;
  billingPeriodEnd: Date | null;
}>;

export type JobCampaignContextRecord = Readonly<{
  marketingConsent: boolean;
  emailSuppressed: boolean;
  locale: "en" | "zh-HK";
}>;

/**
 * What the `event_reminder` journey needs at send time (programme B-5).
 * `deliverable` is false when the event was cancelled or unpublished after the
 * member registered, or when the member has since cancelled their seat.
 */
export type JobEventReminderContextRecord = Readonly<{
  eventId: string;
  slug: string;
  titleEn: string;
  titleZh: string | null;
  startsAt: Date;
  venue: string | null;
  deliverable: boolean;
}>;

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

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("INVALID_JOB_CONTEXT");
  return value;
}

function membershipStatus(value: unknown): MembershipStatus | null {
  return typeof value === "string"
    && MEMBERSHIP_STATUSES.includes(value as MembershipStatus)
    ? value as MembershipStatus
    : null;
}

function score(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function defaultDatabaseLoader(): Promise<AutomationDatabase> {
  return await getDb() as unknown as AutomationDatabase;
}

function requireAutomationCron(actor: AutomationRepositoryActor): void {
  requireAutomationSystem(actor);
  if (actor.source !== "automation-cron") forbidden();
}

export function createJobRunnerContextRepository(
  loadDatabase: AutomationDatabaseLoader = defaultDatabaseLoader,
) {
  return {
    async loadJourney(
      actor: AutomationRepositoryActor,
      profileId: string,
      membershipId: string | null,
    ): Promise<JobJourneyContextRecord> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT
          ${profiles.id} AS profile_id,
          ${profiles.email} AS email,
          ${profiles.displayName} AS display_name,
          ${profiles.locale} AS locale,
          ${profiles.lastLoginAt} AS last_login_at,
          ${profiles.consentMarketing} AS consent_marketing,
          ${profiles.onboardingState} AS onboarding_state,
          ${profiles.whatsappOptIn} AS whatsapp_opt_in,
          ${profiles.whatsappNumber} AS whatsapp_number,
          ${engagementScores.score} AS engagement_score,
          ${memberships.status} AS membership_status,
          ${memberships.billingPeriodEnd} AS billing_period_end,
          EXISTS (
            SELECT 1
            FROM ${messageSuppressions}
            WHERE ${messageSuppressions.profileId} = ${profiles.id}
              AND ${messageSuppressions.channel} = 'email'
              AND ${messageSuppressions.classification} = 'marketing'
          ) AS email_suppressed
        FROM ${profiles}
        LEFT JOIN ${engagementScores}
          ON ${engagementScores.profileId} = ${profiles.id}
        LEFT JOIN ${memberships}
          ON ${memberships.id} = ${membershipId}
        WHERE ${profiles.id} = ${profileId}
        LIMIT 1
      `))[0];
      if (!row || String(row.profile_id) !== profileId) {
        throw new Error("JOB_CONTEXT_NOT_FOUND");
      }
      const displayName = optionalString(row.display_name);
      if (!displayName) throw new Error("INVALID_JOB_CONTEXT");
      return {
        profileId,
        email: optionalString(row.email),
        displayName,
        locale: row.locale === "zh-HK" ? "zh-HK" : "en",
        lastLoginAt: optionalDate(row.last_login_at),
        marketingConsent: requiredBoolean(row.consent_marketing),
        profileComplete: row.onboarding_state === "complete",
        whatsappOptIn: requiredBoolean(row.whatsapp_opt_in),
        whatsappNumber: optionalString(row.whatsapp_number),
        emailSuppressed: requiredBoolean(row.email_suppressed),
        engagementScore: score(row.engagement_score),
        membershipStatus: membershipStatus(row.membership_status),
        billingPeriodEnd: optionalDate(row.billing_period_end),
      };
    },

    async loadEventReminder(
      actor: AutomationRepositoryActor,
      profileId: string,
      eventId: string,
    ): Promise<JobEventReminderContextRecord | null> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT
          ${events.id} AS event_id,
          ${events.slug} AS slug,
          ${events.titleEn} AS title_en,
          ${events.titleZh} AS title_zh,
          ${events.startsAt} AS starts_at,
          ${events.venue} AS venue,
          ${events.status} AS event_status,
          ${eventRegistrations.status} AS registration_status
        FROM ${events}
        LEFT JOIN ${eventRegistrations}
          ON ${eventRegistrations.eventId} = ${events.id}
         AND ${eventRegistrations.profileId} = ${profileId}
        WHERE ${events.id} = ${eventId}
        LIMIT 1
      `))[0];
      if (!row) return null;
      const startsAt = optionalDate(row.starts_at);
      const titleEn = optionalString(row.title_en);
      const slug = optionalString(row.slug);
      if (!startsAt || !titleEn || !slug) throw new Error("INVALID_JOB_CONTEXT");
      const registrationStatus = optionalString(row.registration_status);
      return {
        eventId: String(row.event_id),
        slug,
        titleEn,
        titleZh: optionalString(row.title_zh),
        startsAt,
        venue: optionalString(row.venue),
        deliverable: row.event_status === "published"
          && (registrationStatus === "registered" || registrationStatus === "attended"),
      };
    },

    async loadCampaign(
      actor: AutomationRepositoryActor,
      profileId: string,
    ): Promise<JobCampaignContextRecord> {
      requireAutomationCron(actor);
      const database = await loadDatabase();
      const row = rowsFrom(await database.execute(sql`
        SELECT
          ${profiles.consentMarketing} AS consent_marketing,
          ${profiles.locale} AS locale,
          EXISTS (
            SELECT 1
            FROM ${messageSuppressions}
            WHERE ${messageSuppressions.profileId} = ${profiles.id}
              AND ${messageSuppressions.channel} = 'email'
              AND ${messageSuppressions.classification} = 'marketing'
          ) AS email_suppressed
        FROM ${profiles}
        WHERE ${profiles.id} = ${profileId}
        LIMIT 1
      `))[0];
      if (!row) throw new Error("JOB_CONTEXT_NOT_FOUND");
      return {
        marketingConsent: requiredBoolean(row.consent_marketing),
        emailSuppressed: requiredBoolean(row.email_suppressed),
        locale: row.locale === "zh-HK" ? "zh-HK" : "en",
      };
    },
  };
}

export type JobRunnerContextRepository =
  ReturnType<typeof createJobRunnerContextRepository>;

export const jobRunnerContextRepository =
  createJobRunnerContextRepository();
