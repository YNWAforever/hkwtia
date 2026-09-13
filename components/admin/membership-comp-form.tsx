"use client";

import {useActionState} from "react";

import type {CompMembershipActionState} from "@/lib/admin/membership-comp-action-core";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

type Props = Readonly<{
  action: (state: CompMembershipActionState, formData: FormData) => Promise<CompMembershipActionState>;
  labels: Readonly<{title: string; description: string; planLabel: string; submit: string}>;
  profileId: string;
  state?: CompMembershipActionState;
}>;

export function MembershipCompForm({action, labels, profileId, state: initialState}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState ?? {});
  return (
    <section className="glass-card p-5 sm:p-7">
      <h2 className="font-serif text-2xl font-semibold">{labels.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{labels.description}</p>
      <form action={formAction} className="mt-4 space-y-4" data-testid="membership-comp-form">
        <input name="profileId" type="hidden" value={profileId} readOnly/>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="membership-comp-plan">{labels.planLabel}</label>
          <select className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="membership-comp-plan" name="planCode" required>
            {MEMBERSHIP_PLAN_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-primary-foreground" disabled={pending} type="submit">
          {labels.submit}
        </button>
        {state.message
          ? <p className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
          : null}
      </form>
    </section>
  );
}
