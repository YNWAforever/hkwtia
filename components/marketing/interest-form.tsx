"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {InterestResult} from "@/lib/growth/interest-service";

export type InterestFormLabels = Readonly<{
  email: string; displayName: string; whatsappNumber: string; whatsappOptIn: string; consent: string;
  website: string; submit: string; submitting: string; success: string; invalid: string; rateLimited: string;
}>;

type FormState = Readonly<{status: "idle" | "success" | "invalid" | "rate_limited"}>;
const initialState: FormState = {status: "idle"};

export function InterestForm({action, locale, labels, id = "interest"}: Readonly<{
  action: (formData: FormData) => Promise<InterestResult>;
  locale: AppLocale;
  labels: InterestFormLabels;
  id?: string;
}>) {
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await action(formData);
      return result.ok ? {status: "success"} : {status: result.code};
    },
    initialState,
  );
  const statusMessage = state.status === "success" ? labels.success
    : state.status === "invalid" ? labels.invalid
      : state.status === "rate_limited" ? labels.rateLimited : "";

  return <form action={formAction} className="partner-form interest-form" noValidate>
    <input name="locale" type="hidden" value={locale} />
    <div className="form-grid">
      <label htmlFor={`${id}-email`}><span>{labels.email}</span><input aria-describedby={`${id}-status`} autoComplete="email" id={`${id}-email`} name="email" required type="email" /></label>
      <label htmlFor={`${id}-name`}><span>{labels.displayName}</span><input aria-describedby={`${id}-status`} autoComplete="name" id={`${id}-name`} name="displayName" type="text" /></label>
      <label htmlFor={`${id}-whatsapp`}><span>{labels.whatsappNumber}</span><input aria-describedby={`${id}-status`} autoComplete="tel" id={`${id}-whatsapp`} name="whatsappNumber" type="tel" /></label>
    </div>
    <label className="consent" htmlFor={`${id}-opt-in`}>
      <input id={`${id}-opt-in`} name="whatsappOptIn" type="checkbox" />
      <span>{labels.whatsappOptIn}</span>
    </label>
    <p className="interest-form-consent">{labels.consent}</p>
    <label className="sr-only" htmlFor={`${id}-website`}>{labels.website}<input autoComplete="off" id={`${id}-website`} name="website" tabIndex={-1} type="text" /></label>
    <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
    <p aria-live="polite" className={state.status === "invalid" || state.status === "rate_limited" ? "form-error" : "interest-form-status"} id={`${id}-status`}>{statusMessage}</p>
  </form>;
}
