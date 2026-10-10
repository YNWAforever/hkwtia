import "server-only";

import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {requireAdmin} from "@/lib/auth/authorize";
import {emailEnv} from "@/lib/config/env";
import {
  contactActivitiesRepository,
  type ContactActivitiesRepository,
} from "@/lib/db/repos/contact-activities";
import {contactsRepository, type ContactsRepository} from "@/lib/db/repos/contacts";
import {joinInvitesRepository, type JoinInvitesRepository} from "@/lib/db/repos/join-invites";
import {actorContactEmail} from "@/lib/db/repos/profile-identities";
import {renderEmail} from "@/lib/email/render";
import {
  createConfiguredEmailTransport,
  DeliveryFailure,
  type EmailTransport,
} from "@/lib/email/transport";
import type {Actor} from "@/lib/membership/lifecycle";
import {absoluteUrl, localizedPath} from "@/lib/urls";

export {whatsappInviteHref} from "@/lib/admin/whatsapp-invite-href";

/**
 * Phase E. The actor-taking core behind the lead page's "personal join link".
 *
 * Like `contact-action-core.ts` these take the actor first, so they must never
 * live in a `"use server"` module — see `lib/admin/lead-invite-actions.ts` for
 * the wrappers that resolve the actor from the session.
 *
 * The raw link is secret in the way a password-reset link is: it is returned to
 * the one admin who asked, shown once, and goes nowhere else — not into the
 * timeline, the audit metadata, a log line or a thrown message.
 */
export type LeadInviteDependencies = Readonly<{
  invites: Pick<JoinInvitesRepository, "create">;
  contacts: Pick<ContactsRepository, "get" | "localeOf">;
  activities: Pick<ContactActivitiesRepository, "recordInviteSent">;
  /** The acting staff member's own address, for Reply-To. Null when the profile has none. */
  staffEmail: (actor: Actor) => Promise<string | null>;
  /** Lazy: building the configured transport reads the Resend key, which a test or a page render must not need. */
  transport: () => EmailTransport;
  emailFrom: () => string;
  render: typeof renderEmail;
}>;

function defaultDependencies(): LeadInviteDependencies {
  return {
    invites: joinInvitesRepository,
    contacts: contactsRepository,
    activities: contactActivitiesRepository,
    staffEmail: async (actor) => ("profileId" in actor ? actorContactEmail({profileId: actor.profileId}) : null),
    transport: () => createConfiguredEmailTransport(),
    emailFrom: () => emailEnv().emailFrom,
    render: renderEmail,
  };
}

// `patron` is invitation-by-review elsewhere; a lead link never offers it. The
// repository refuses it too, but failing here keeps the refusal ahead of any read.
const planSchema = z.enum(["community", "startup", "corporate"]);
const idSchema = z.string().uuid();
const messageSchema = z.string().trim().max(1000);

export async function createLeadInvite(
  actor: Actor,
  contactId: unknown,
  planCode: unknown,
  deps: LeadInviteDependencies = defaultDependencies(),
): Promise<{url: string; inviteId: string}> {
  requireAdmin(actor);
  const id = idSchema.parse(contactId);
  const plan = planSchema.parse(planCode);
  const locale: AppLocale = (await deps.contacts.localeOf(actor, id)) ?? "en";
  const {invite, token} = await deps.invites.create(actor, {contactId: id, planCode: plan});
  return {
    url: absoluteUrl(localizedPath(locale, `/join/invite/${token}`)),
    inviteId: invite.id,
  };
}

const INVITE_PATH = /^(?:\/zh)?\/join\/invite\/[A-Za-z0-9_-]+$/;

/**
 * The link arrives from the browser, so it is checked to be one of OUR invite
 * URLs before it goes into an email sent from our domain. Without this, an
 * admin session replaying a forged form could send an arbitrary link under the
 * WTIA name.
 */
function assertOwnInviteUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("INVITE_URL_INVALID");
  }
  if (parsed.origin !== new URL(absoluteUrl("/")).origin || !INVITE_PATH.test(parsed.pathname) || parsed.search !== "" || parsed.hash !== "") {
    throw new Error("INVITE_URL_INVALID");
  }
}

export async function sendLeadInviteEmail(
  actor: Actor,
  input: Readonly<{contactId: unknown; inviteId: unknown; inviteUrl: unknown; message: unknown}>,
  deps: LeadInviteDependencies = defaultDependencies(),
): Promise<"sent" | "failed"> {
  requireAdmin(actor);
  const contactId = idSchema.parse(input.contactId);
  const inviteId = idSchema.parse(input.inviteId);
  const inviteUrl = z.string().max(500).parse(input.inviteUrl);
  const message = messageSchema.parse(input.message ?? "");
  assertOwnInviteUrl(inviteUrl);

  const contact = await deps.contacts.get(actor, contactId);
  if (!contact) throw new Error("CONTACT_NOT_FOUND");
  if (!contact.email) throw new Error("CONTACT_EMAIL_MISSING");
  const locale: AppLocale = (await deps.contacts.localeOf(actor, contactId)) ?? "en";

  const rendered = await deps.render({
    template: "lead_join_invite",
    locale,
    recipientName: contact.displayName ?? contact.email,
    classification: "transactional",
    variables: {ctaUrl: inviteUrl, message},
  });
  const replyTo = await deps.staffEmail(actor);

  let status: "sent" | "failed" = "sent";
  try {
    await deps.transport().send({
      to: contact.email,
      from: deps.emailFrom(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      idempotencyKey: `lead-invite:${inviteId}`,
      ...(replyTo ? {replyTo} : {}),
    });
  } catch (error) {
    // Only a provider refusal is an outcome the page can report. Anything else
    // (a missing key, a render fault) is a defect and must stay loud.
    if (!(error instanceof DeliveryFailure)) throw error;
    status = "failed";
  }
  await deps.activities.recordInviteSent(actor, {contactId, inviteId, channel: "email", status});
  return status;
}

/** `copy` and `whatsapp` are handovers the server cannot observe; the admin says they happened. */
export async function recordLeadInviteShared(
  actor: Actor,
  input: Readonly<{contactId: unknown; inviteId: unknown; channel: unknown}>,
  deps: Pick<LeadInviteDependencies, "activities"> = defaultDependencies(),
): Promise<void> {
  requireAdmin(actor);
  const channel = z.enum(["copy", "whatsapp"]).parse(input.channel);
  await deps.activities.recordInviteSent(actor, {
    contactId: idSchema.parse(input.contactId),
    inviteId: idSchema.parse(input.inviteId),
    channel,
    status: "sent",
  });
}

/** The state each invite action reports back to the panel. The link lives only here. */
export type LeadInviteCreateState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "created"; url: string; inviteId: string}>
  | Readonly<{status: "error"}>;
export type LeadInviteEmailState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "sent" | "failed" | "error"}>;
