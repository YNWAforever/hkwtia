"use client";

import {useActionState, useEffect, useRef, useState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {GuestRsvpFieldErrors} from "@/lib/events/guest-registration-input";
import type {GuestRsvpResult} from "@/lib/events/guest-registration-core";

export type GuestRsvpLabels = Readonly<{
  title: string; name: string; email: string; organisation: string; whatsappNumber: string; marketingConsent: string; consent: string;
  website: string; submit: string; submitting: string; registered: string; waitlist: string; already: string; confirmationPending: string;
  invalid: string; rateLimited: string; closed: string; external: string; unavailable: string;
  requiredField: string; invalidField: string; invalidEmail: string; invalidWhatsapp: string; errorReference: string;
}>;

type FormStatus = "idle" | "registered" | "waitlist" | "already_registered" | "confirmation_pending" | "invalid" | "rate_limited" | "closed" | "external" | "unavailable";
type FormState = Readonly<{status: FormStatus; fieldErrors?: GuestRsvpFieldErrors; errorId?: string}>;
const initialState: FormState = {status: "idle"};
const FAILED: readonly FormStatus[] = ["invalid", "rate_limited", "closed", "external", "unavailable", "confirmation_pending"];

/** Anonymous RSVP on the event detail page (programme B-4), shaped like the interest form. */
export function GuestRsvpForm({action, eventId, locale, labels, id = "guest-rsvp"}: Readonly<{
  action: (formData: FormData) => Promise<GuestRsvpResult>;
  eventId: string;
  locale: AppLocale;
  labels: GuestRsvpLabels;
  id?: string;
}>) {
  const [values, setValues] = useState({name: "", email: "", organisation: "", whatsappNumber: "", marketingConsent: false});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const whatsappRef = useRef<HTMLInputElement>(null);
  const organisationRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      try {
        const result = await action(formData);
        if (result.ok) return {status: result.disposition};
        return {
          status: result.code,
          fieldErrors: result.code === "invalid" ? result.fieldErrors : undefined,
          errorId: result.code === "unavailable" ? result.errorId : undefined,
        };
      } catch {
        // A lost action response should leave this form and its entered values usable.
        return {status: "unavailable"};
      }
    },
    initialState,
  );
  const fieldErrors = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.status !== "invalid") return;
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.whatsappNumber) whatsappRef.current?.focus();
    else if (fieldErrors.organisation) organisationRef.current?.focus();
  }, [state.status, fieldErrors.name, fieldErrors.email, fieldErrors.whatsappNumber, fieldErrors.organisation]);
  const message: Record<FormStatus, string> = {
    idle: "", registered: labels.registered, waitlist: labels.waitlist, already_registered: labels.already, confirmation_pending: labels.confirmationPending,
    invalid: labels.invalid, rate_limited: labels.rateLimited, closed: labels.closed, external: labels.external, unavailable: labels.unavailable,
  };
  const errorText = (field: keyof GuestRsvpFieldErrors) => {
    const code = fieldErrors[field];
    if (!code) return null;
    if (code === "required") return labels.requiredField;
    if (field === "email") return labels.invalidEmail;
    if (field === "whatsappNumber") return labels.invalidWhatsapp;
    return labels.invalidField;
  };
  const failed = FAILED.includes(state.status);

  return <form action={formAction} aria-labelledby={`${id}-title`} className="partner-form guest-rsvp-form" noValidate>
    <h3 id={`${id}-title`}>{labels.title}</h3>
    <input name="eventId" type="hidden" value={eventId} />
    <input name="locale" type="hidden" value={locale} />
    <div className="form-grid">
      <div>
        <label htmlFor={`${id}-name`}><span>{labels.name}</span><input aria-describedby={`${id}-name-error ${id}-status`} aria-invalid={Boolean(fieldErrors.name)} autoComplete="name" id={`${id}-name`} name="name" onChange={(event) => setValues((current) => ({...current, name: event.target.value}))} ref={nameRef} required type="text" value={values.name} /></label>
        {fieldErrors.name && <span className="guest-rsvp-field-error" id={`${id}-name-error`}>{errorText("name")}</span>}
      </div>
      <div>
        <label htmlFor={`${id}-email`}><span>{labels.email}</span><input aria-describedby={`${id}-email-error ${id}-status`} aria-invalid={Boolean(fieldErrors.email)} autoComplete="email" id={`${id}-email`} name="email" onChange={(event) => setValues((current) => ({...current, email: event.target.value}))} ref={emailRef} required type="email" value={values.email} /></label>
        {fieldErrors.email && <span className="guest-rsvp-field-error" id={`${id}-email-error`}>{errorText("email")}</span>}
      </div>
      <div>
        <label htmlFor={`${id}-organisation`}><span>{labels.organisation}</span><input aria-describedby={`${id}-organisation-error ${id}-status`} aria-invalid={Boolean(fieldErrors.organisation)} autoComplete="organization" id={`${id}-organisation`} name="organisation" onChange={(event) => setValues((current) => ({...current, organisation: event.target.value}))} ref={organisationRef} type="text" value={values.organisation} /></label>
        {fieldErrors.organisation && <span className="guest-rsvp-field-error" id={`${id}-organisation-error`}>{errorText("organisation")}</span>}
      </div>
      <div>
        <label htmlFor={`${id}-whatsapp`}><span>{labels.whatsappNumber}</span><input aria-describedby={`${id}-whatsapp-error ${id}-status`} aria-invalid={Boolean(fieldErrors.whatsappNumber)} autoComplete="tel" id={`${id}-whatsapp`} name="whatsappNumber" onChange={(event) => setValues((current) => ({...current, whatsappNumber: event.target.value}))} ref={whatsappRef} type="tel" value={values.whatsappNumber} /></label>
        {fieldErrors.whatsappNumber && <span className="guest-rsvp-field-error" id={`${id}-whatsapp-error`}>{errorText("whatsappNumber")}</span>}
      </div>
    </div>
    <label className="consent" htmlFor={`${id}-consent`}>
      <input checked={values.marketingConsent} id={`${id}-consent`} name="marketingConsent" onChange={(event) => setValues((current) => ({...current, marketingConsent: event.target.checked}))} type="checkbox" />
      <span>{labels.marketingConsent}</span>
    </label>
    <p className="interest-form-consent">{labels.consent}</p>
    <label className="sr-only" htmlFor={`${id}-website`}>{labels.website}<input autoComplete="off" id={`${id}-website`} name="website" tabIndex={-1} type="text" /></label>
    <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
    <p aria-live="polite" className={failed ? "form-error" : "interest-form-status"} id={`${id}-status`}>
      {message[state.status]}{state.errorId && <span> {labels.errorReference} {state.errorId}</span>}
    </p>
  </form>;
}
