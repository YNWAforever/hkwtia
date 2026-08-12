"use client";

import {useActionState} from "react";

import type {MemberProfileActionState} from "@/lib/admin/member-profile-actions";

type Labels = Readonly<{
  heading: string;
  description: string;
  displayName: string;
  phone: string;
  jobTitle: string;
  locale: string;
  locales: Readonly<Record<string, string>>;
  optional: string;
  save: string;
  saving: string;
}>;

type Values = Partial<Readonly<{
  displayName: string;
  phone: string | null;
  jobTitle: string | null;
  locale: string;
}>>;

const localeOrder = ["en", "zh-HK"] as const;

const initialState: MemberProfileActionState = {};

/**
 * Contact details only. Membership tier, status, billing linkage, role and the
 * consent flags are shown elsewhere as read-only: they are either driven by
 * Stripe or are the member's own choice to make.
 */
export function MemberProfileForm({
  action,
  labels,
  values = {},
}: Readonly<{
  action: (state: MemberProfileActionState, formData: FormData) => Promise<MemberProfileActionState>;
  labels: Labels;
  values?: Values;
}>) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const value = (name: keyof Values, fallback?: string | null) =>
    state.values?.[name] ?? fallback ?? "";
  const error = (name: string) =>
    state.fieldErrors?.[name]
      ? <p className="text-sm text-destructive" id={`${name}-error`} role="alert">{state.fieldErrors[name]}</p>
      : null;
  const fieldProps = (name: string) => ({
    ...(state.values?.[name] !== undefined ? {key: `${name}-${state.values[name]}`} : {}),
    "aria-invalid": Boolean(state.fieldErrors?.[name]),
    "aria-describedby": state.fieldErrors?.[name] ? `${name}-error` : undefined,
  });

  const field = "mt-2 block min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

  return (
    <section aria-labelledby="member-profile-edit" className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl font-semibold" id="member-profile-edit">{labels.heading}</h2>
        <p className="text-muted-foreground">{labels.description}</p>
      </header>
      <form action={formAction} className="glass-card grid gap-4 p-6 md:grid-cols-2" noValidate>
        <label className="text-sm font-semibold" htmlFor="member-display-name">
          {labels.displayName}
          <input className={field} defaultValue={value("displayName", values.displayName)} id="member-display-name" name="displayName" required {...fieldProps("displayName")}/>
          {error("displayName")}
        </label>
        <label className="text-sm font-semibold" htmlFor="member-job-title">
          {labels.jobTitle}
          <input className={field} defaultValue={value("jobTitle", values.jobTitle)} id="member-job-title" name="jobTitle" {...fieldProps("jobTitle")}/>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.optional}</p>
          {error("jobTitle")}
        </label>
        <label className="text-sm font-semibold" htmlFor="member-phone">
          {labels.phone}
          <input className={field} defaultValue={value("phone", values.phone)} id="member-phone" name="phone" {...fieldProps("phone")}/>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{labels.optional}</p>
          {error("phone")}
        </label>
        <label className="text-sm font-semibold" htmlFor="member-locale">
          {labels.locale}
          <select className={field} defaultValue={value("locale", values.locale ?? "en")} id="member-locale" name="locale" {...fieldProps("locale")}>
            {localeOrder.map((locale) => (
              <option key={locale} value={locale}>{labels.locales[locale] ?? locale}</option>
            ))}
          </select>
          {error("locale")}
        </label>
        <div className="flex items-center justify-end gap-4 md:col-span-2">
          {state.message
            ? <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
            : null}
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
            {pending ? labels.saving : labels.save}
          </button>
        </div>
      </form>
    </section>
  );
}
