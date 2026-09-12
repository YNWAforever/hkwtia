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
  contacts,
  engagementScores,
  eventRegistrations,
  events,
  membershipPlans,
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
  /**
   * The linked contact's recorded STOP (C-9 review). `profiles` carries no
   * withdrawal column, so this is the other half of the fact `whatsappOptIn`
   * only half answers — see the join in `loadJourney` for the incident.
   */
  whatsappOptedOutAt: Date | null;
  emailSuppressed: boolean;
  engagementScore: number | null;
  membershipStatus: MembershipStatus | null;
  billingPeriodEnd: Date | null;
  /**
   * What the membership's plan charges for its billing interval, in whole HKD,
   * or `null` when the plan records no price for it (C-9 review).
   *
   * `dunning_3`'s WhatsApp template declares an `amountDue` BODY parameter and
   * nothing produced one, so the runner sent it empty — which Meta rejects. This
   * is the only recorded amount in the tree: there is no invoice table, and
   * `billing_attempts.price_reference` is a Stripe price id, not a figure. It is
   * the same number `lib/admin/report-formulas.ts` already treats as what a
   * membership is worth, so the two cannot disagree about one member.
   *
   * Nullable on purpose, and the caller must not default it: a patron or
   * community plan has no price for its interval, and "HK$0.00 outstanding" in a
   * message chasing a payment is worse than no WhatsApp at all. A null makes
   * `resolveTemplateBody` refuse the send and the email leg still goes out.
   */
  amountDueHkd: number | null;
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

/**
 * `optionalDate`, except that an unparseable value is an error rather than a
 * `null` (C-9 review).
 *
 * The difference matters for exactly one column. `optionalDate` fails OPEN —
 * anything it cannot read becomes "no date" — which is the right default for
 * `last_login_at` or `billing_period_end`, where a missing date only changes a
 * condition or a rendered string. `contacts.whatsapp_opted_out_at` is a consent
 * gate: `null` there means "this person never said STOP", so a value this
 * function could not read would be silently converted into permission to send.
 * `lib/db/repos/message-eligibility.ts` reads the same column through
 * `z.coerce.date()`, which fails closed; this is the same stance in the shape
 * this module already uses.
 *
 * Nothing should ever reach the throw — the pg driver hands back a `Date` for a
 * timestamptz, and Node parses its text form correctly when it does not — which
 * is the point: if the driver's shape ever changes, the cron fails loudly and is
 * retried rather than quietly sending to someone who opted out.
 */
function consentDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = optionalDate(value);
  if (date === null) throw new Error("INVALID_JOB_CONTEXT");
  return date;
}

/**
 * A recorded price in whole HKD, or `null` — and `0` is a `null` (C-9 review).
 *
 * The column is `integer` and nullable, and a zero-priced plan (community) has
 * nothing outstanding, so both absences answer the same question the same way:
 * there is no figure to put in `wtia_dunning_d3`'s second BODY parameter, and
 * the send must be refused rather than padded.
 */
function priceAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
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
          -- C-9 review. The journey lane was the one send path that read only
          -- profiles.whatsapp_opt_in, and that flag is not the whole consent
          -- fact. woztell-profile-resolver returns null whenever two profiles
          -- share the digits (a company handset: matches.length is not 1), so
          -- the webhook STOP branch never reaches suppressionsRepository
          -- .optOutWhatsApp -- only markWhatsAppOptedOut, which is keyed on the
          -- PHONE and writes nothing but contacts. The flag stays true, no
          -- message_suppressions row is ever written, and before this join
          -- renewal_14, dunning_3 and event_reminder_24h kept going to a
          -- handset that had said STOP on every tick after the flag flip.
          --
          -- Read it beside whatsapp_opt_in, never instead of it: together the
          -- pair is exactly decideWhatsApp rule 1 for a member recipient
          -- (lib/db/repos/message-eligibility.ts), whose member-side COALESCE
          -- arm is non-null only when the flag is already false. Same join,
          -- same precedence, so the journey lane, the blast and the inbox
          -- cannot disagree about one person. contacts_profile_unique is a
          -- partial UNIQUE index on profile_id, so this join is at most one row
          -- and the journey row cannot fan out.
          ${contacts.whatsappOptedOutAt} AS whatsapp_opted_out_at,
          ${engagementScores.score} AS engagement_score,
          ${memberships.status} AS membership_status,
          ${memberships.billingPeriodEnd} AS billing_period_end,
          -- C-9 review. dunning_3's WhatsApp template declares an amountDue
          -- BODY parameter and nothing produced one, so every live tick would
          -- have sent parameter 2 empty -- which Meta rejects, which the adapter
          -- maps to provider_client_error, which S-15 makes permanent: one
          -- failed step and one staff task per member in arrears, and no member
          -- receiving the message at all.
          --
          -- The plan price for the membership's own interval is the only amount
          -- this tree records. There is no invoice table, and
          -- billing_attempts.price_reference is a Stripe price id rather than a
          -- figure. lib/admin/report-formulas.ts already treats exactly this
          -- number as what a membership is worth, so the dunning message and the
          -- board report cannot disagree about one member. 'none' is the free
          -- interval and has no arm here on purpose: NULL, not zero.
          CASE ${memberships.billingInterval}
            WHEN 'monthly' THEN ${membershipPlans.monthlyPriceHkd}
            WHEN 'annual' THEN ${membershipPlans.annualPriceHkd}
            ELSE NULL
          END AS amount_due_hkd,
          EXISTS (
            SELECT 1
            FROM ${messageSuppressions}
            WHERE ${messageSuppressions.profileId} = ${profiles.id}
              AND ${messageSuppressions.channel} = 'email'
              AND ${messageSuppressions.classification} = 'marketing'
          ) AS email_suppressed
        FROM ${profiles}
        LEFT JOIN ${contacts}
          ON ${contacts.profileId} = ${profiles.id}
        LEFT JOIN ${engagementScores}
          ON ${engagementScores.profileId} = ${profiles.id}
        LEFT JOIN ${memberships}
          ON ${memberships.id} = ${membershipId}
        -- Keyed on the plan's primary key, so this join is at most one row and
        -- the journey row cannot fan out -- the same property the contacts join
        -- above relies on its partial unique index for.
        LEFT JOIN ${membershipPlans}
          ON ${membershipPlans.code} = ${memberships.planCode}
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
        whatsappOptedOutAt: consentDate(row.whatsapp_opted_out_at),
        emailSuppressed: requiredBoolean(row.email_suppressed),
        engagementScore: score(row.engagement_score),
        membershipStatus: membershipStatus(row.membership_status),
        billingPeriodEnd: optionalDate(row.billing_period_end),
        amountDueHkd: priceAmount(row.amount_due_hkd),
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
