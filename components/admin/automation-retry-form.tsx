"use client";

import {useActionState} from "react";

import type {AppLocale} from "@/i18n/routing";
import type {RetryAutomationActionState} from "@/lib/admin/automations";

export type RetryAutomationAction = (
  state: RetryAutomationActionState,
  formData: FormData,
) => Promise<RetryAutomationActionState>;

type AutomationRetryLabels = Readonly<{
  retry: string;
  retrying: string;
  retryScheduled: string;
  retryValidation: string;
  retryUnavailable: string;
  retryError: string;
}>;

type AutomationRetryFormProps = Readonly<{
  action: RetryAutomationAction;
  journeyId: string;
  labels: AutomationRetryLabels;
  locale: AppLocale;
}>;

function actionMessage(
  state: RetryAutomationActionState,
  labels: AutomationRetryLabels,
): string {
  switch (state.code) {
    case "scheduled":
      return labels.retryScheduled;
    case "validation":
      return labels.retryValidation;
    case "unavailable":
      return labels.retryUnavailable;
    case "error":
      return labels.retryError;
    default:
      return "";
  }
}

export function AutomationRetryForm({
  action,
  journeyId,
  labels,
  locale,
}: AutomationRetryFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const message = actionMessage(state, labels);

  return (
    <form action={formAction} className="space-y-2">
      <input name="journeyId" type="hidden" value={journeyId} />
      <input name="locale" type="hidden" value={locale} />
      <button
        className="rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? labels.retrying : labels.retry}
      </button>
      <span
        aria-live="polite"
        className={state.status === "error"
          ? "block max-w-56 text-xs text-destructive"
          : "block max-w-56 text-xs text-muted-foreground"}
        role="status"
      >
        {message}
      </span>
    </form>
  );
}
