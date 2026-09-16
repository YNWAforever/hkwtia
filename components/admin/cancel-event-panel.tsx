"use client";

import {useActionState, useState} from "react";

// Type-only: the action itself arrives as a prop, bound by the page.
import type {EventActionState} from "@/lib/admin/event-action-core";
import type {CancellationPreview} from "@/lib/db/repos/events";

export type CancelPanelLabels = Readonly<{
  heading: string; description: string; button: string; keep: string; submitting: string;
  unavailable: string; confirm: string;
}>;

const initialState: EventActionState = {};

/**
 * The staff member's own locale, so a zh-HK page does not show an `en-HK` amount.
 */
function amountLabel(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}).format(cents / 100);
}

/**
 * The confirmation is interpolated by hand, so `labels.confirm` carries literal
 * placeholders and the replacements are functions: a string replacement would
 * reinterpret `$&` / `$'` in the replacement text.
 */
function costedSentence(labels: CancelPanelLabels, preview: CancellationPreview, locale: string): string {
  return labels.confirm
    .replace("{orders}", () => String(preview.paidOrders))
    .replace("{amount}", () => amountLabel(preview.refundTotalHkdCents, locale))
    .replace("{attendees}", () => String(preview.attendees))
    .replace("{registrants}", () => String(preview.rsvpRegistrants));
}

/**
 * `action` is the page's bound server action, so the panel never has to know the
 * revalidation path. It is already a Server Function reference, which is what a
 * client component may hold; a locally-defined closure would not be. The control
 * posts nothing until it is opened, so a stray click cannot cancel an event.
 */
export function CancelEventPanel({action, labels, locale, preview}: Readonly<{
  action: (state: EventActionState, formData: FormData) => Promise<EventActionState>;
  labels: CancelPanelLabels;
  locale: string;
  preview: CancellationPreview | null;
}>) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-2xl font-semibold">{labels.heading}</h2>
      <p className="text-sm text-muted-foreground">{labels.description}</p>
      {confirming ? (
        <form action={dispatch} className="space-y-3">
          {/* The confirmation is a polite status region, not an assertive alert:
              it is a question the staff member just opened. */}
          <p role="status">{preview === null ? labels.unavailable : costedSentence(labels, preview, locale)}</p>
          <button className="min-h-11 rounded-md bg-destructive px-4 text-destructive-foreground" disabled={pending} type="submit">{pending ? labels.submitting : labels.button}</button>
          <button className="ml-2 min-h-11 rounded-md border px-4" disabled={pending} onClick={() => setConfirming(false)} type="button">{labels.keep}</button>
        </form>
      ) : (
        <button className="min-h-11 rounded-md border border-destructive px-4 text-destructive" onClick={() => setConfirming(true)} type="button">{labels.button}</button>
      )}
      {state.message ? <p className="text-sm" role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </div>
  );
}
