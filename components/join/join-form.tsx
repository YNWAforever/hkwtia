"use client";

import {useActionState, type ReactNode} from "react";

export type JoinFormState = Readonly<{message?: string; fieldErrors?: Readonly<Record<string, string>>}>;
export const initialJoinFormState: JoinFormState = {};

export function JoinForm({action, children, fieldNames, submitLabel, pendingLabel}: {
  action: (state: JoinFormState, formData: FormData) => Promise<JoinFormState>;
  children: ReactNode;
  fieldNames: readonly string[];
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialJoinFormState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {children}
      {fieldNames.map((name) => state.fieldErrors?.[name] ? (
        <p className="text-sm text-destructive" id={`${name}-error`} key={name} role="alert">{state.fieldErrors[name]}</p>
      ) : null)}
      {state.message ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
