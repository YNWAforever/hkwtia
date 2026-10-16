import "server-only";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {emailEnv} from "@/lib/config/env";
import {
  leadRemindersRepository,
  type LeadReminderInputs,
  type LeadReminderRecipient,
  type LeadRemindersRepository,
} from "@/lib/db/repos/lead-reminders";
import {renderEmail} from "@/lib/email/render";
import {
  createConfiguredEmailTransport,
  DeliveryFailure,
  type EmailTransport,
} from "@/lib/email/transport";
import {absoluteUrl, localizedPath} from "@/lib/urls";

/**
 * Phase E, Task 9. The daily lead digest: one email per staff recipient, sent at
 * 08:00 Hong Kong. There are no `staff_tasks` rows (plan ruling R-2) — that table
 * is keyed to a member profile and most leads have none — so the board's overdue
 * filter and this email are the whole reminder.
 *
 * Time is Hong Kong time throughout. A next-step due DAY is stored as 18:00 HKT
 * (10:00Z), so:
 *   overdue   — the stored instant has passed;
 *   due today — the instant has not passed yet and falls on today's Hong Kong date.
 * That is the definition the lead page and the board already use. The clock is
 * always a parameter, never read here.
 */
export type LeadReminderDependencies = Readonly<{
  repo: Pick<LeadRemindersRepository, "load">;
  /** Lazy: building the configured transport reads the Resend key, which a test must not need. */
  transport: () => EmailTransport;
  emailFrom: () => string;
  render: typeof renderEmail;
}>;

function defaultDependencies(): LeadReminderDependencies {
  return {
    repo: leadRemindersRepository,
    transport: () => createConfiguredEmailTransport(),
    emailFrom: () => emailEnv().emailFrom,
    render: renderEmail,
  };
}

const HKT_OFFSET_MS = 8 * 3_600_000;
const STALE_INVITE_MS = 3 * 86_400_000;
/** Names listed per section before the rest collapse to a count; the board has the full list. */
const SECTION_LIMIT = 10;

/** The Hong Kong calendar day (YYYY-MM-DD) of an instant. Hong Kong has no DST, so a fixed offset is exact. */
export function hktDate(instant: Date): string {
  return new Date(instant.getTime() + HKT_OFFSET_MS).toISOString().slice(0, 10);
}

export type DigestItem = Readonly<{id: string; name: string; detail: string}>;

export type LeadDigest = Readonly<{
  recipient: LeadReminderRecipient;
  overdue: readonly DigestItem[];
  dueToday: readonly DigestItem[];
  stale: readonly DigestItem[];
  unassigned: readonly DigestItem[];
}>;

function describeStep(lead: LeadReminderInputs["leads"][number]): string {
  const due = lead.nextStepDueAt === null ? "" : hktDate(lead.nextStepDueAt);
  const step = lead.nextStep?.trim() ?? "";
  if (step && due) return `${step}, ${due}`;
  return step || due;
}

function item(id: string, name: string, detail: string): DigestItem {
  return {id, name: name.trim() || id, detail};
}

export function buildLeadDigests(
  recipients: readonly LeadReminderRecipient[],
  leads: readonly LeadReminderInputs["leads"][number][],
  staleInvites: readonly LeadReminderInputs["staleInvites"][number][],
  now: Date,
): LeadDigest[] {
  const today = hktDate(now);
  const staleBefore = now.getTime() - STALE_INVITE_MS;
  const unassigned = leads.filter((lead) => lead.ownerProfileId === null).map((lead) => item(lead.id, lead.displayName, describeStep(lead)));

  // One line per lead however many invites it has been sent.
  const staleLeads = new Map<string, LeadReminderInputs["staleInvites"][number]>();
  for (const invite of staleInvites) {
    if (invite.openedAt.getTime() >= staleBefore || invite.ownerProfileId === null) continue;
    if (!staleLeads.has(invite.contactId)) staleLeads.set(invite.contactId, invite);
  }

  return recipients.map((recipient) => {
    const own = leads.filter((lead) => lead.ownerProfileId === recipient.profileId && lead.nextStepDueAt !== null);
    const overdue = own
      // Final review M2: `<`, the board's and the lead page's definition — overdue once the
      // instant has passed; at the instant itself the step is still due today.
      .filter((lead) => lead.nextStepDueAt!.getTime() < now.getTime())
      .map((lead) => item(lead.id, lead.displayName, describeStep(lead)));
    const dueToday = own
      .filter((lead) => lead.nextStepDueAt!.getTime() >= now.getTime() && hktDate(lead.nextStepDueAt!) === today)
      .map((lead) => item(lead.id, lead.displayName, describeStep(lead)));
    const stale = [...staleLeads.values()]
      .filter((invite) => invite.ownerProfileId === recipient.profileId)
      .map((invite) => item(invite.contactId, invite.displayName, hktDate(invite.openedAt)));
    return {recipient, overdue, dueToday, stale, unassigned};
  });
}

function isEmpty(digest: LeadDigest): boolean {
  return digest.overdue.length + digest.dueToday.length + digest.stale.length + digest.unassigned.length === 0;
}

/** "Ada Wong (Call back, 2026-10-15); Ben Lo" — or "-" when the section is empty. Language-neutral on purpose. */
function listOf(items: readonly DigestItem[]): string {
  if (items.length === 0) return "-";
  const shown = items.slice(0, SECTION_LIMIT).map((entry) => (entry.detail ? `${entry.name} (${entry.detail})` : entry.name));
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join("; ")} (+${rest})` : shown.join("; ");
}

export async function runLeadReminders(
  now: Date,
  deps: LeadReminderDependencies = defaultDependencies(),
): Promise<{digestsSent: number; skipped: number}> {
  const inputs = await deps.repo.load(automationCronActor(), now);
  const digests = buildLeadDigests(inputs.recipients, inputs.leads, inputs.staleInvites, now);
  const day = hktDate(now);
  let digestsSent = 0;
  let skipped = 0;
  for (const digest of digests) {
    if (isEmpty(digest)) {
      skipped += 1;
      continue;
    }
    const {recipient} = digest;
    const rendered = await deps.render({
      template: "lead_digest",
      locale: recipient.locale,
      recipientName: recipient.displayName,
      classification: "transactional",
      variables: {
        ctaUrl: absoluteUrl(`${localizedPath(recipient.locale, "/admin/contacts")}?view=board`),
        overdueCount: digest.overdue.length,
        overdue: listOf(digest.overdue),
        dueTodayCount: digest.dueToday.length,
        dueToday: listOf(digest.dueToday),
        staleCount: digest.stale.length,
        stale: listOf(digest.stale),
        unassignedCount: digest.unassigned.length,
        unassigned: listOf(digest.unassigned),
      },
    });
    try {
      await deps.transport().send({
        to: recipient.email,
        from: deps.emailFrom(),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: rendered.headers,
        // The HKT date, not the run instant: a retry or a second run the same day is
        // the same digest, and the provider drops it.
        idempotencyKey: `lead-digest:${recipient.profileId}:${day}`,
      });
      digestsSent += 1;
    } catch (error) {
      // A provider refusal costs one recipient their digest today; a missing key or
      // a render fault is a defect and must stay loud.
      if (!(error instanceof DeliveryFailure)) throw error;
      skipped += 1;
    }
  }
  return {digestsSent, skipped};
}
