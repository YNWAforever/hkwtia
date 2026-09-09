import "server-only";

import type {AppLocale} from "@/i18n/routing";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {journeysRepository} from "@/lib/db/repos/journeys";
import type {EmailVariables} from "@/lib/email/catalog";
import {localizedPath} from "@/lib/urls";

export const EVENT_REMINDER_JOURNEY = "event_reminder" as const;
export const EVENT_REMINDER_STEP = "reminder_24h" as const;

const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
const INSTANCE_KEY_PREFIX = "event:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventReminderEnrollmentInput = Readonly<{
  profileId: string;
  eventId: string;
  startsAt: Date;
}>;

export type ReminderEnrollmentDependencies = Readonly<{
  journeys: Pick<typeof journeysRepository, "enroll">;
  now?: () => Date;
}>;

export function eventInstanceKey(eventId: string): string {
  return `${INSTANCE_KEY_PREFIX}${eventId}`;
}

/** Inverse of `eventInstanceKey`; null for any other journey's key shape. */
export function eventIdFromInstanceKey(instanceKey: string): string | null {
  if (!instanceKey.startsWith(INSTANCE_KEY_PREFIX)) return null;
  const id = instanceKey.slice(INSTANCE_KEY_PREFIX.length);
  return UUID_PATTERN.test(id) ? id : null;
}

/**
 * S-2: one journey_state row per (profile, event), scheduled 24 h before the
 * start. Anchored on the event, not on "now", so the existing runner's
 * `scheduled_at <= now` claim fires it at the right time. Events starting
 * inside 24 h get no reminder — the confirmation just sent is the reminder.
 *
 * The row carries no membership: a member's seat outlives any one billing
 * period, and `journey_state.membership_id` cascades on membership delete.
 * The enrolling actor is the automation-cron system actor because that is the
 * only non-webhook source `requireAutomationSystem` accepts; this module is
 * never reachable from a "use server" export, so nothing client-side can mint it.
 */
export async function enrollEventReminder(
  input: EventReminderEnrollmentInput,
  deps: ReminderEnrollmentDependencies = {journeys: journeysRepository},
): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const scheduledAt = new Date(input.startsAt.getTime() - REMINDER_LEAD_MS);
  if (scheduledAt <= now) return;
  const instanceKey = eventInstanceKey(input.eventId);
  await deps.journeys.enroll(automationCronActor(), {
    profileId: input.profileId,
    membershipId: null,
    journey: EVENT_REMINDER_JOURNEY,
    instanceKey,
    step: EVENT_REMINDER_STEP,
    scheduledAt,
    deliveryKey: `journey:${input.profileId}:${EVENT_REMINDER_JOURNEY}:${instanceKey}:${EVENT_REMINDER_STEP}`,
  });
}

export type EventReminderSource = Readonly<{
  slug: string;
  titleEn: string;
  titleZh: string | null;
  startsAt: Date;
  venue: string | null;
}>;

// Members read the start time as a wall-clock time in Hong Kong regardless of
// where the runner executes; the site has no other timezone.
const startFormatters: Record<AppLocale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en-GB", {dateStyle: "long", timeStyle: "short", timeZone: "Asia/Hong_Kong"}),
  "zh-HK": new Intl.DateTimeFormat("zh-HK", {dateStyle: "long", timeStyle: "short", timeZone: "Asia/Hong_Kong"}),
};

/**
 * Template variables for the `event_reminder_24h` step. `eventUrl` and
 * `ctaUrl` are the same absolute, locale-prefixed event page: the email
 * button reads `ctaUrl`, the WhatsApp body reads `eventUrl`.
 */
export function eventReminderVariables(input: Readonly<{
  locale: AppLocale;
  appUrl: string;
  event: EventReminderSource;
}>): EmailVariables & Readonly<{eventTitle: string; startsAt: string; venue: string; eventUrl: string; ctaUrl: string}> {
  const title = input.locale === "zh-HK" && input.event.titleZh?.trim()
    ? input.event.titleZh.trim()
    : input.event.titleEn;
  // `appUrl` (server-validated `APP_URL`), not `absoluteUrl`/`NEXT_PUBLIC_SITE_URL`
  // (client-exposed, silently falls back to localhost) — same base its
  // runners.ts callers (unsubscribeUrls, portalUrl) already use for outbound
  // links this automation sends.
  const url = new URL(localizedPath(input.locale, `/events/${input.event.slug}`), input.appUrl).toString();
  return {
    eventTitle: title,
    startsAt: startFormatters[input.locale].format(input.event.startsAt),
    venue: input.event.venue?.trim() ?? "",
    eventUrl: url,
    ctaUrl: url,
  };
}
