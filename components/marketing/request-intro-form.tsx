"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {LeadRequestResult} from "@/lib/showcase/lead-actions";

type Labels = Readonly<{
  name: string;
  email: string;
  organization: string;
  message: string;
  website: string;
  submit: string;
  submitting: string;
  success: string;
  invalid: string;
  rateLimited: string;
}>;

type FormState = Readonly<{status: "idle" | "success" | "invalid" | "rate_limited"}>;
const initialState: FormState = {status: "idle"};

export function RequestIntroForm({
  action,
  locale,
  slug,
  labels,
}: Readonly<{
  action: (formData: FormData) => Promise<LeadRequestResult>;
  locale: AppLocale;
  slug: string;
  labels: Labels;
}>) {
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await action(formData);
      if (result.ok) return {status: "success"};
      return {status: result.code};
    },
    initialState,
  );
  const statusMessage = state.status === "success"
    ? labels.success
    : state.status === "invalid"
      ? labels.invalid
      : state.status === "rate_limited"
        ? labels.rateLimited
        : "";

  return <form action={formAction} className="partner-form" noValidate>
    <input name="slug" type="hidden" value={slug} />
    <input name="locale" type="hidden" value={locale} />
    <div className="form-grid">
      <label htmlFor="showcase-contact-name"><span>{labels.name}</span><input aria-describedby="request-intro-status" autoComplete="name" id="showcase-contact-name" name="contactName" required type="text" /></label>
      <label htmlFor="showcase-contact-email"><span>{labels.email}</span><input aria-describedby="request-intro-status" autoComplete="email" id="showcase-contact-email" name="email" required type="email" /></label>
      <label htmlFor="showcase-contact-organization"><span>{labels.organization}</span><input aria-describedby="request-intro-status" autoComplete="organization" id="showcase-contact-organization" name="organization" type="text" /></label>
    </div>
    <label htmlFor="showcase-contact-message"><span>{labels.message}</span><textarea aria-describedby="request-intro-status" id="showcase-contact-message" maxLength={4_000} name="message" rows={5} /></label>
    <label className="sr-only" htmlFor="showcase-website">{labels.website}<input autoComplete="off" id="showcase-website" name="website" tabIndex={-1} type="text" /></label>
    <button className="button" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button>
    <p aria-live="polite" className={state.status === "invalid" || state.status === "rate_limited" ? "form-error" : undefined} id="request-intro-status">{statusMessage}</p>
  </form>;
}
