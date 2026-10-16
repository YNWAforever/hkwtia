"use client";
import {startTransition, useActionState, useEffect, useRef, type ReactNode} from "react";
import type {SeatAction, SeatFeedbackLabels} from "@/lib/portal/seat-action-state";

export function SeatOperationForm({action, children, labels, submitLabel, buttonClassName = "button", className, confirmation, clearOnSuccess = false}: Readonly<{
  action: SeatAction; children: ReactNode; labels: SeatFeedbackLabels; submitLabel: string; buttonClassName?: string;
  className?: string; confirmation?: string; clearOnSuccess?: boolean;
}>) {
  const [state, dispatch, pending] = useActionState(action, {status: "idle"});
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!pending) submitting.current = false;
    if (!pending && state.status === "success" && form.current) {
      delete form.current.dataset.dirty;
      if (clearOnSuccess) form.current.reset();
    }
  }, [state, pending, clearOnSuccess]);
  return <form action={dispatch} className={className} ref={form} onSubmit={(event) => {
    event.preventDefault();
    if (submitting.current || (confirmation && !window.confirm(confirmation))) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    startTransition(() => dispatch(data));
  }}>
    {children}
    <button className={buttonClassName} disabled={pending} type="submit">{pending ? labels.pending : submitLabel}</button>
    {state.status === "success" ? <p aria-live="polite" role="status">{labels.success}</p> : null}
    {state.status === "error" ? <p className="portal-form-alert" role="alert">{labels.errors[state.code]}</p> : null}
  </form>;
}
