"use client";

import {useActionState, useState, useTransition} from "react";

import {whatsappInviteHref} from "@/lib/admin/whatsapp-invite-href";

type CreateState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "created"; url: string; inviteId: string}>
  | Readonly<{status: "error"}>;
type EmailState =
  | Readonly<{status: "idle"}>
  | Readonly<{status: "sent" | "failed" | "error"}>;

const PLAN_CODES = ["community", "startup", "corporate"] as const;

/**
 * Phase E. Create a personal join link and hand it over.
 *
 * The link is held only in this component's action state: the server returns it
 * once and stores none of it, so a reload shows the invite's state but not the
 * URL, and "Create a join link" mints a fresh one (superseding the old). Email
 * is disabled without an address and WhatsApp without a number, with the reason
 * written next to the control rather than a silent grey button.
 *
 * Final review I3: when the contact's latest link is still live or opened, a new
 * one silently retired a link the lead may be holding. The panel now says so and
 * keeps Create disabled until the admin ticks the confirm; the server refuses the
 * supersede without that field too (`createLeadInvite`).
 */
export function LeadJoinLinkPanel({
  contactId,
  hasEmail,
  phoneE164,
  latestNote,
  createAction,
  emailAction,
  recordShared,
  supersedesLiveLink = false,
  labels,
}: Readonly<{
  contactId: string;
  hasEmail: boolean;
  phoneE164: string | null;
  latestNote?: string;
  createAction: (previous: CreateState, formData: FormData) => Promise<CreateState>;
  emailAction: (previous: EmailState, formData: FormData) => Promise<EmailState>;
  recordShared: (contactId: string, inviteId: string, channel: "copy" | "whatsapp") => Promise<void>;
  /** True when the latest link is live or opened, so creating one would retire it. */
  supersedesLiveLink?: boolean;
  labels: Readonly<{
    title: string; plan: string; plans: Readonly<Record<(typeof PLAN_CODES)[number], string>>;
    create: string; linkLabel: string; copy: string; copied: string; messageLabel: string;
    email: string; whatsapp: string; sent: string; failed: string; noEmail: string; noPhone: string; error: string;
    supersedeWarning: string; supersedeConfirm: string;
  }>;
}>) {
  const [created, createFormAction, creating] = useActionState(createAction, {status: "idle"} as CreateState);
  const [emailed, emailFormAction, emailing] = useActionState(emailAction, {status: "idle"} as EmailState);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [, startTransition] = useTransition();

  const link = created.status === "created" ? created : null;
  const share = (channel: "copy" | "whatsapp") => {
    if (!link) return;
    // Fire and forget: the handover has already happened in the browser, and a
    // failed timeline write must not undo or block it.
    startTransition(() => { void recordShared(contactId, link.inviteId, channel).catch(() => undefined); });
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the field below is selectable, so the
      // admin can still copy by hand.
      return;
    }
    share("copy");
  };

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">{labels.title}</h2>
      {latestNote ? <p className="text-sm text-muted-foreground">{latestNote}</p> : null}

      <form action={createFormAction} className="flex flex-wrap items-end gap-3">
        <input name="contactId" type="hidden" value={contactId} />
        <label className="text-sm" htmlFor="lead-invite-plan">
          <span className="mb-1 block text-xs text-muted-foreground">{labels.plan}</span>
          <select className="min-h-11 rounded-md border border-input bg-background px-3 text-sm" defaultValue="community" id="lead-invite-plan" name="planCode">
            {PLAN_CODES.map((code) => <option key={code} value={code}>{labels.plans[code]}</option>)}
          </select>
        </label>
        {supersedesLiveLink ? (
          <div className="basis-full space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <p id="lead-invite-supersede-warning">{labels.supersedeWarning}</p>
            <label className="flex min-h-11 items-center gap-2" htmlFor="lead-invite-supersede-confirm">
              <input
                aria-describedby="lead-invite-supersede-warning"
                checked={confirmed}
                className="h-4 w-4 shrink-0"
                id="lead-invite-supersede-confirm"
                name="confirmSupersede"
                onChange={(event) => setConfirmed(event.target.checked)}
                required
                type="checkbox"
              />
              <span>{labels.supersedeConfirm}</span>
            </label>
          </div>
        ) : null}
        <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={creating || (supersedesLiveLink && !confirmed)} type="submit">{labels.create}</button>
      </form>
      {created.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.error}</p> : null}

      {link ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="lead-invite-url">{labels.linkLabel}</label>
            <div className="flex flex-wrap gap-2">
              <input className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" id="lead-invite-url" onFocus={(event) => event.currentTarget.select()} readOnly value={link.url} />
              <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium" onClick={() => void copy()} type="button">{copied ? labels.copied : labels.copy}</button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="lead-invite-message">{labels.messageLabel}</label>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="lead-invite-message" maxLength={1000} onChange={(event) => setMessage(event.target.value)} value={message}
            />
          </div>

          <div className="flex flex-wrap items-start gap-4">
            <form action={emailFormAction} className="space-y-1">
              <input name="contactId" type="hidden" value={contactId} />
              <input name="inviteId" type="hidden" value={link.inviteId} />
              <input name="inviteUrl" type="hidden" value={link.url} />
              <input name="message" type="hidden" value={message} />
              <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!hasEmail || emailing} type="submit">{labels.email}</button>
              {!hasEmail ? <p className="text-xs text-muted-foreground">{labels.noEmail}</p> : null}
            </form>
            <div className="space-y-1">
              {phoneE164 ? (
                <a
                  className="inline-flex min-h-11 items-center rounded-md border border-input px-4 py-2 text-sm font-medium"
                  href={whatsappInviteHref(phoneE164, message ? `${message} ${link.url}` : link.url)}
                  onClick={() => share("whatsapp")}
                  rel="noopener noreferrer"
                  target="_blank"
                >{labels.whatsapp}</a>
              ) : (
                <>
                  <button className="min-h-11 rounded-md border border-input px-4 py-2 text-sm font-medium opacity-50" disabled type="button">{labels.whatsapp}</button>
                  <p className="text-xs text-muted-foreground">{labels.noPhone}</p>
                </>
              )}
            </div>
          </div>
          {emailed.status === "sent" ? <p className="text-sm" role="status">{labels.sent}</p> : null}
          {emailed.status === "failed" ? <p className="text-sm text-destructive" role="alert">{labels.failed}</p> : null}
          {emailed.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
