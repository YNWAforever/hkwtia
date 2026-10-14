"use client";

import {createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes} from "react";
import type {PortalFormField, PortalFormLabels, PortalFormState} from "@/lib/portal/form-state";

const initial: PortalFormState = {status: "idle"};
const FormContext = createContext<{state: PortalFormState; labels: PortalFormLabels; pending: boolean} | null>(null);
function usePortalForm() {
  const context = useContext(FormContext);
  if (!context) throw new Error("PORTAL_FORM_CONTEXT_REQUIRED");
  return context;
}

export function PortalForm({action, labels, children, readOnly = false}: Readonly<{
  action: (state: PortalFormState, data: FormData) => Promise<PortalFormState>;
  labels: PortalFormLabels; children: ReactNode; readOnly?: boolean;
}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!pending) submitting.current = false;
    if (state.status === "success" && form.current) form.current.dataset.dirty = "false";
    if (state.status === "validation_error") {
      const field = Object.keys(state.fieldErrors)[0];
      const control = field ? form.current?.elements.namedItem(field) : null;
      if (control instanceof HTMLElement) control.focus();
    }
  }, [state, pending]);
  return <FormContext.Provider value={{state, labels, pending}}>
    <form ref={form} action={readOnly ? undefined : dispatch} className="portal-form" noValidate aria-busy={pending} onSubmit={(event) => {
      // Manual dispatch preserves uncontrolled values on a rejected save. Without JS the
      // action is still a server form; with JS React's automatic form reset is prevented.
      event.preventDefault();
      if (readOnly || submitting.current) return;
      submitting.current = true;
      const data = new FormData(event.currentTarget);
      startTransition(() => dispatch(data));
    }}>
      {state.status !== "idle" ? <p className={state.status === "success" ? "portal-form-message" : "portal-form-alert"} role={state.status === "success" ? "status" : "alert"} aria-live="polite">{labels[state.status]}</p> : null}
      {children}
    </form>
  </FormContext.Provider>;
}

function useField(name: string | undefined, describedBy?: string) {
  const {state, labels} = usePortalForm();
  const id = useId();
  const code = state.status === "validation_error" ? state.fieldErrors[name as PortalFormField] : undefined;
  const error = code ? <p className="portal-field-help" id={id}>{labels.fields[code]}</p> : null;
  return {error, invalid: code ? true : undefined, describedBy: [describedBy, code ? id : undefined].filter(Boolean).join(" ") || undefined};
}

export function PortalInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const field = useField(props.name, props["aria-describedby"]);
  return <><input {...props} aria-invalid={field.invalid} aria-describedby={field.describedBy} />{field.error}</>;
}
export function PortalTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useField(props.name, props["aria-describedby"]);
  return <><textarea {...props} aria-invalid={field.invalid} aria-describedby={field.describedBy} />{field.error}</>;
}
export function PortalSubmit() {
  const {pending, labels} = usePortalForm();
  return <button className="button" type="submit" disabled={pending}>{pending ? labels.saving : labels.save}</button>;
}
