"use client";

import {submitWithBrParts} from "@/lib/membership/br-submission";

import {useActionState, useEffect, useRef, useSyncExternalStore, type ReactNode} from "react";

const subscribeToHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export type JoinFormState = Readonly<{message?: string; fieldErrors?: Readonly<Record<string, string>>}>;
export const initialJoinFormState: JoinFormState = {};

export function JoinForm({action, children, fieldNames, submitLabel, pendingLabel, submitDisabled = false, splitBusinessRegistration = false}: {
  action: (state: JoinFormState, formData: FormData) => Promise<JoinFormState>;
  children: ReactNode;
  fieldNames: readonly string[];
  submitLabel: string;
  pendingLabel: string;
  submitDisabled?: boolean;
  splitBusinessRegistration?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<JoinFormState | null>(null);
  // Preserve native action metadata until hydration enables bounded file submissions.
  const hydrated = useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverSnapshot);
  const [state, formAction, pending] = useActionState(splitBusinessRegistration && hydrated
    ? (state: JoinFormState, data: FormData) => submitWithBrParts(action, state, data)
    : action, initialJoinFormState);
  const hasErrors = Boolean(state.message || Object.keys(state.fieldErrors ?? {}).length);

  useEffect(() => {
    const form = formRef.current;
    // React suppresses synthetic events while committing its automatic reset.
    const preserveSubmission = (event: Event) => {
      if (submitted.current !== null) event.preventDefault();
    };
    form?.addEventListener("reset", preserveSubmission);
    return () => { form?.removeEventListener("reset", preserveSubmission); };
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let firstInvalid: HTMLElement | null = null;
    for (const name of fieldNames) {
      const field = form.elements.namedItem(name);
      if (!(field instanceof HTMLElement)) continue;
      if (state.fieldErrors?.[name]) {
        field.setAttribute("aria-invalid", "true");
        const disclosure = field.closest("details");
        if (disclosure) disclosure.open = true;
        firstInvalid ??= field;
      } else {
        field.removeAttribute("aria-invalid");
      }
    }
    firstInvalid?.focus();
  }, [state, fieldNames]);

  useEffect(() => {
    if (pending || submitted.current === null || state === submitted.current) return;
    submitted.current = null;
    if (!hasErrors) formRef.current?.reset();
  }, [state, pending, hasErrors]);

  return (
    <form action={formAction} className="space-y-5" noValidate ref={formRef}
      onSubmitCapture={() => { submitted.current = state; }}
      onReset={(event) => { if (submitted.current !== null || pending || hasErrors) event.preventDefault(); }}>
      {children}
      {fieldNames.map((name) => state.fieldErrors?.[name] ? (
        <p className="text-sm text-destructive" id={`${name}-error`} key={name} role="alert">{state.fieldErrors[name]}</p>
      ) : null)}
      {state.message ? <p className="text-sm text-destructive" role="alert">{state.message}</p> : null}
      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending || submitDisabled} type="submit">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
