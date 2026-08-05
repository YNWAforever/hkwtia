"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {CohortApplicationActionState} from "@/lib/launchpad/member-actions";
import {localizedPath} from "@/lib/urls";

export type CohortApplicationFormLabels = Readonly<{
  title: string; cohort: string; market: string; readiness: string; consent: string;
  submit: string; submitting: string; success: string; invalid: string; unauthorized: string; signIn: string; error: string;
}>;

type OpenCohort = Readonly<{id: string; name: string; status?: string}>;
const initialState: CohortApplicationActionState = {status: "idle"};

export function CohortApplicationForm({action, cohorts, labels, locale = "en"}: Readonly<{
  action: (formData: FormData) => Promise<CohortApplicationActionState>;
  cohorts: readonly OpenCohort[];
  labels: CohortApplicationFormLabels;
  locale?: AppLocale;
}>) {
  const availableCohorts = cohorts.filter((cohort) => cohort.status === undefined || cohort.status === "open");
  const [state, formAction, pending] = useActionState(
    async (_previous: CohortApplicationActionState, formData: FormData) => action(formData), initialState,
  );
  const message = state.status === "success" ? labels.success : state.status === "error" ? labels.error : state.status === "invalid" ? labels.invalid : "";

  if (availableCohorts.length === 0) return null;
  return <section aria-labelledby="cohort-application-title" className="glass-card space-y-5 p-6">
    <h2 className="font-serif text-2xl font-semibold" id="cohort-application-title">{labels.title}</h2>
    <form action={formAction} className="grid gap-5 sm:grid-cols-2" noValidate>
      <input name="locale" type="hidden" value={locale}/>
      <label className="space-y-2 text-sm font-medium" htmlFor="cohort-application-cohort"><span>{labels.cohort}</span><select aria-describedby="cohort-application-status" className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue="" id="cohort-application-cohort" name="cohortId" required><option disabled value="">{labels.cohort}</option>{availableCohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}</select></label>
      <label className="space-y-2 text-sm font-medium" htmlFor="cohort-application-market"><span>{labels.market}</span><input aria-describedby="cohort-application-status" autoComplete="country-name" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="cohort-application-market" maxLength={120} name="market" required type="text"/></label>
      <label className="space-y-2 text-sm font-medium sm:col-span-2" htmlFor="cohort-application-readiness"><span>{labels.readiness}</span><textarea aria-describedby="cohort-application-status" className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2" id="cohort-application-readiness" maxLength={500} name="readiness" required rows={4}/></label>
      <label className="flex items-start gap-3 text-sm sm:col-span-2" htmlFor="cohort-application-consent"><input aria-describedby="cohort-application-status" className="mt-1 size-4" id="cohort-application-consent" name="consent" required type="checkbox"/><span>{labels.consent}</span></label>
      <div className="space-y-3 sm:col-span-2"><button className="min-h-11 rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{pending ? labels.submitting : labels.submit}</button><p aria-live="polite" className={state.status === "success" ? "text-sm text-muted-foreground" : "text-sm text-destructive"} id="cohort-application-status" role={state.status === "error" || state.status === "invalid" || state.status === "unauthorized" ? "alert" : undefined}>{state.status === "unauthorized" ? <><span>{labels.unauthorized} </span><a className="underline" href={localizedPath(locale, "/join?next=/launchpad")}>{labels.signIn}</a></> : message}</p></div>
    </form>
  </section>;
}
