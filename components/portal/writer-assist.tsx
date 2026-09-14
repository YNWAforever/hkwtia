"use client";

import {useActionState, useEffect, useRef} from "react";

import {writerAssistAction, type WriterActionErrorCode, type WriterActionState} from "@/lib/portal/writer-actions";
import type {WriterKind} from "@/lib/ai/writers/contracts";

export type WriterAssistLabels = Readonly<{
  label: string; briefLabel: string; briefPlaceholder: string; generate: string; generating: string;
  errors: Readonly<Record<WriterActionErrorCode, string>>;
}>;

export type WriterAssistProps = Readonly<{
  kind: WriterKind;
  labels: WriterAssistLabels;
  quotaLabel: string;
  exhausted: boolean;
}>;

/**
 * The one control every writer surface renders. It posts a brief to the shared
 * action and hands the returned copy to `onGenerated`; the surface decides which
 * of its fields that copy belongs in. A generation persists nothing — the member
 * still saves the form, and publication stays behind the existing review machine.
 */
export function WriterAssist({kind, labels, quotaLabel, exhausted, onGenerated}: WriterAssistProps & {
  onGenerated: (copy: Readonly<Record<string, string>>) => void;
}) {
  const [state, dispatch, pending] = useActionState<WriterActionState | null, FormData>(writerAssistAction, null);
  const applied = useRef<WriterActionState | null>(null);

  // Apply each success exactly once: the action state object is stable across
  // re-renders, so identity is what marks a new result.
  useEffect(() => {
    if (state?.status === "ok" && applied.current !== state) {
      applied.current = state;
      onGenerated(state.copy);
    }
  }, [state, onGenerated]);

  return (
    <details className="rounded-md border border-border bg-muted/30 p-4">
      <summary className="cursor-pointer text-sm font-medium">{labels.label}</summary>
      <form action={dispatch} className="mt-3 space-y-3">
        <input name="kind" type="hidden" value={kind} />
        <label className="block space-y-2 text-sm font-medium">
          <span>{labels.briefLabel}</span>
          <textarea className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2" name="brief" placeholder={labels.briefPlaceholder} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex min-h-11 items-center rounded-md border border-input px-4 text-sm font-medium disabled:opacity-50" disabled={pending || exhausted} type="submit">
            {pending ? labels.generating : labels.generate}
          </button>
          <span className="text-sm text-muted-foreground">{quotaLabel}</span>
        </div>
        {state?.status === "error" ? <p className="text-sm text-destructive" role="alert">{labels.errors[state.code]}</p> : null}
      </form>
    </details>
  );
}
