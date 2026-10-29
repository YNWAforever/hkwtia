import "server-only";

import {appEnv, emailEnv} from "@/lib/config/env";
import type {EmailVariables} from "@/lib/email/catalog";
import {renderEmail, type RenderEmailInput, type RenderedEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport, type EmailTransport} from "@/lib/email/transport";
import {localizedPath} from "@/lib/urls";

export type MemberRsvpNoticeKind = "registered" | "waitlist" | "withdrawn";

const TEMPLATES = {
  registered: "event_member_confirmation",
  waitlist: "event_member_waitlist",
  withdrawn: "event_member_rsvp_withdrawn",
} as const satisfies Record<MemberRsvpNoticeKind, RenderEmailInput["template"]>;

export type MemberRsvpNotice = Readonly<{
  to: string;
  recipientName: string;
  locale: "en" | "zh-HK";
  kind: MemberRsvpNoticeKind;
  eventId: string;
  profileId: string;
  eventTitle: string;
  slug: string;
}>;

type MailDependencies = Readonly<{
  transport: EmailTransport;
  renderEmail: (input: RenderEmailInput) => Promise<RenderedEmail>;
  emailFrom: string;
  appUrl: string;
}>;

/** Stable for one member, event, and outcome, so a retried send does not duplicate inside the provider window. */
export function memberRsvpIdempotencyKey(kind: MemberRsvpNoticeKind, eventId: string, profileId: string): string {
  return `member-rsvp:${kind}:${eventId}:${profileId}`;
}

/**
 * Sends the member RSVP receipt or withdrawal note.
 * Tests pass a transport. The production call with no dependencies does nothing
 * when NODE_ENV is test, so a registration test cannot reach Resend.
 * A failed send is the caller's problem to log: the RSVP itself is already committed.
 */
export async function deliverMemberRsvpNotice(notice: MemberRsvpNotice, dependencies?: MailDependencies): Promise<void> {
  if (!dependencies && process.env.NODE_ENV === "test") return;
  if (!notice.to || !notice.eventTitle || !notice.slug) return;
  const environment = dependencies ? null : emailEnv();
  const transport = dependencies?.transport ?? createConfiguredEmailTransport(environment!);
  const render = dependencies?.renderEmail ?? renderEmail;
  const from = dependencies?.emailFrom ?? environment!.emailFrom;
  const appUrl = dependencies?.appUrl ?? appEnv().appUrl;
  const variables: EmailVariables = {
    eventTitle: notice.eventTitle,
    ctaUrl: appUrl + localizedPath(notice.locale, `/events/${notice.slug}`),
  };
  const rendered = await render({
    template: TEMPLATES[notice.kind],
    locale: notice.locale,
    recipientName: notice.recipientName,
    classification: "transactional",
    variables,
  });
  await transport.send({
    to: notice.to,
    from,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: rendered.headers,
    idempotencyKey: memberRsvpIdempotencyKey(notice.kind, notice.eventId, notice.profileId),
  });
}
