"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {GuestRsvpResult} from "@/lib/events/guest-registration-core";

export type GuestRsvpLabels = Readonly<{
  title: string; name: string; email: string; organisation: string; whatsappNumber: string; marketingConsent: string; consent: string;
  website: string; submit: string; submitting: string; registered: string; waitlist: string; already: string;
  invalid: string; rateLimited: string; closed: string; external: string; unavailable: string;
}>;

type FormStatus = "idle" | "registered" | "waitlist" | "already_registered" | "invalid" | "rate_limited" | "closed" | "external" | "unavailable";
type FormState = Readonly<{status: FormStatus}>;
const initialState: FormState = {status: "idle"};
const FAILED: readonly FormStatus[] = ["invalid", "rate_limited", "closed", "external", "unavailable"];

/** Anonymous RSVP on the event detail page (programme B-4), shaped like the interest form. */
export function GuestRsvpForm({action, eventId, locale, labels, id = "guest-rsvp"}: Readonly<{
  action: (formData: FormData) => Promise<GuestRsvpResult>;
  eventId: string;
  locale: AppLocale;
  labels: GuestRsvpLabels;
  id?: string;
}>) {
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await action(formData);
      return {status: result.ok ? result.disposition : result.code};
    },
    initialState,
  );
  const message: Record<FormStatus, string> = {
    idle: "", registered: labels.registered, waitlist: labels.waitlist, already_registered: labels.already,
    invalid: labels.invalid, rate_limited: labels.rateLimited, closed: labels.closed, external: labels.external, unavailable: labels.unavailable,
  };
  const failed = FAILED.includes(state.status);

  return <form action={formAction} aria-labelledby={`${id}-title`} className="partner-form guest-rsvp-form" noValidate>
    <h3 id={`${id}-title`}>{labels.title}</h3>
    <input name="eventId" type="hidden" value={eventId} />
    <input name="locale" type="hidden" value={locale} />
    <div className="form-grid">
      <label htmlFor={`${id}-name`}><span>{labels.name}</span><input aria-describedby={`${id}-status`} autoComplete="name" id={`${id}-name`} name="name" required type="text" /></label>
      <label htmlFor={`${id}-email`}><span>{labels.email}</span><input aria-describedby={`${id}-status`} autoComplete="email" id={`${id}-email`} name="email" required type="email" /></label>
      <label htmlFor={`${id}-organisation`}><span>{labels.organisation}</span><input autoComplete="organization" id={`${id}-organisation`} name="organisation" type="text" /></label>
      <label htmlFor={`${id}-whatsapp`}><span>{labels.whatsappNumber}</span><input aria-describedby={`${id}-status`} autoComplete="tel" id={`${id}-whatsapp`} name="whatsappNumber" type="tel" /></label>
    </div>
    <label className="consent" htmlFor={`${id}-consent`}>
      <input id={`${id}-consent`} name="marketingConsent" type="checkbox" />
      <span>{labels.marketingConsent}</span>
    </label>
    <p className="interest-form-consent">{labels.consent}</p>
    <label className="sr-only" htmlFor={`${id}-website`}>{labels.website}<input autoComplete="off" id={`${id}-website`} name="website" tabIndex={-1} type="text" /></label>
    <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
    <p aria-live="polite" className={failed ? "form-error" : "interest-form-status"} id={`${id}-status`}>{message[state.status]}</p>
  </form>;
}
