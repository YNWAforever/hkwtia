"use client";
import { useActionState, useState } from "react";
import {
  SUPPORT_NEXT_ACTIONS,
  SUPPORT_CLOSE_REASONS,
  type SupportFollowUp,
  type SupportFollowUpState,
} from "@/lib/admin/support-followup-types";
export type SupportFollowUpLabels = Readonly<{
  title: string;
  owner: string;
  unassigned: string;
  due: string;
  next: string;
  handling: string;
  closeReason: string;
  noClose: string;
  application: string;
  billing: string;
  reference: string;
  note: string;
  privacy: string;
  save: string;
  saving: string;
  saved: string;
  conflict: string;
  invalid: string;
  unavailable: string;
  reload: string;
  nextActions: Readonly<Record<string, string>>;
  handlingValues: Readonly<Record<string, string>>;
  closeReasons: Readonly<Record<string, string>>;
}>;
export type SupportFollowUpFormProps = Readonly<{
  conversationId: string;
  value: SupportFollowUp;
  owners: readonly { id: string; name: string }[];
  labels: SupportFollowUpLabels;
  channel: "web" | "whatsapp";
  action: (
    state: SupportFollowUpState,
    data: FormData,
  ) => Promise<SupportFollowUpState>;
}>;
export function SupportFollowUpForm({
  conversationId,
  value,
  owners,
  labels,
  channel,
  action,
}: SupportFollowUpFormProps) {
  const [state, submit, pending] = useActionState(action, { status: "idle" });
  const [loaded] = useState(value),
    [handling, setHandling] = useState(value.handling),
    [next, setNext] = useState(value.nextActionCode),
    [owner, setOwner] = useState(value.ownerProfileId ?? "");
  const [draft, setDraft] = useState({
    handoffNote: value.handoffNote,
    applicationId: value.applicationId ?? "",
    billingAttemptId: value.billingAttemptId ?? "",
    supportReference: value.supportReference ?? "",
    closeReason: value.closeReason ?? "",
    dueAt: value.dueAt
      ? new Date(Date.parse(value.dueAt) + 8 * 3600000)
          .toISOString()
          .slice(0, 16)
      : "",
  });
  const change = (key: keyof typeof draft, text: string) =>
    setDraft((previous) => ({ ...previous, [key]: text }));
  const field = "min-h-11 min-w-0 rounded-md border bg-background px-3";
  return (
    <form action={submit} className="space-y-5 rounded-lg border p-4 sm:p-6">
      <h2 className="font-serif text-2xl">{labels.title}</h2>
      <input type="hidden" name="conversationId" value={conversationId} />
      <input
        type="hidden"
        name="expectedVersion"
        value={state.version ?? loaded.version}
      />
      <input
        type="hidden"
        name="expectedAssignedToProfileId"
        value={
          state.ownerProfileId === undefined
            ? (loaded.ownerProfileId ?? "")
            : (state.ownerProfileId ?? "")
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          {labels.owner}
          <select
            aria-label={labels.owner} name="ownerProfileId"
            className={field}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="">{labels.unassigned}</option>
            {owners.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          {labels.due}
          <input
            aria-label={labels.due} name="dueAt"
            type="datetime-local"
            value={draft.dueAt}
            onChange={(event) => change("dueAt", event.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-2">
          {labels.handling}
          <select
            aria-label={labels.handling} name="handling"
            className={field}
            value={handling}
            onChange={(event) => {
              const target = event.target.value as typeof handling;
              setHandling(target);
              setNext(
                target === "closed"
                  ? "follow_up_complete"
                  : next === "follow_up_complete"
                    ? "none"
                    : next,
              );
            }}
          >
            {(["bot", "human", "closed"] as const)
              .filter((key) => key !== "human" || channel === "whatsapp" || loaded.handling==="human")
              .map((key) => (
                <option value={key} key={key} disabled={key==="human"&&channel!=="whatsapp"}>
                  {labels.handlingValues[key]}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-2">
          {labels.next}
          <select
            aria-label={labels.next} name="nextActionCode"
            className={field}
            value={next}
            onChange={(event) => setNext(event.target.value as typeof next)}
          >
            {SUPPORT_NEXT_ACTIONS.filter((key) =>
              handling === "closed"
                ? key === "follow_up_complete"
                : key !== "follow_up_complete",
            ).map((key) => (
              <option value={key} key={key}>
                {labels.nextActions[key]}
              </option>
            ))}
          </select>
        </label>
        {handling === "closed" ? (
          <label className="grid gap-2">
            {labels.closeReason}
            <select
              aria-label={labels.closeReason} name="closeReason"
              className={field}
              required
              value={draft.closeReason}
              onChange={(event) => change("closeReason", event.target.value)}
            >
              <option value="">{labels.noClose}</option>
              {SUPPORT_CLOSE_REASONS.map((key) => (
                <option value={key} key={key}>
                  {labels.closeReasons[key]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" aria-label={labels.closeReason} name="closeReason" value="" />
        )}
      </div>
      <details className="space-y-4">
        <summary className="min-h-11 cursor-pointer">
          {labels.reference}
        </summary>
        <div className="grid gap-4 pt-3 sm:grid-cols-2">
          {(
            ["applicationId", "billingAttemptId", "supportReference"] as const
          ).map((key, index) => (
            <label className="grid gap-2" key={key}>
              {[labels.application, labels.billing, labels.reference][index]}
              <input
                aria-label={[labels.application,labels.billing,labels.reference][index]} name={key}
                value={draft[key]}
                onChange={(event) => change(key, event.target.value)}
                maxLength={key === "supportReference" ? 80 : 36}
                className={field}
              />
            </label>
          ))}
        </div>
      </details>
      <label className="grid gap-2">
        {labels.note}
        <textarea
          aria-label={labels.note} name="handoffNote"
          rows={3}
          maxLength={1000}
          value={draft.handoffNote}
          onChange={(event) => change("handoffNote", event.target.value)}
          required={
            handling === "closed" ||
            owner !==
              (state.ownerProfileId === undefined
                ? (loaded.ownerProfileId ?? "")
                : (state.ownerProfileId ?? ""))
          }
          aria-describedby="support-note-privacy"
          className="rounded-md border bg-background p-3"
        />
      </label>
      <p id="support-note-privacy" className="text-sm text-muted-foreground">
        {labels.privacy}
      </p>
      {state.status !== "idle" ? (
        <p role={state.status === "saved" ? "status" : "alert"}>
          {state.status === "saved"
            ? labels.saved
            : labels[state.code ?? "unavailable"]}
          {state.code === "conflict" ? (
            <button
              type="button"
              className="ml-3 min-h-11 text-primary underline"
              onClick={() => window.location.reload()}
            >
              {labels.reload}
            </button>
          ) : null}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
