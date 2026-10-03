"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminUnsavedChanges } from "@/components/admin/unsaved-changes-guard";
import type { ApplicationAdoptionState } from "@/lib/admin/application-draft-actions";
export function ApplicationDraftAdopt({
  enabled,
  input,
  action,
  labels,
}: Readonly<{
  enabled: boolean;
  input: {
    draftId: string;
    expectedVersion: number;
    expectedCaseVersion: string;
  };
  action: (input: unknown) => Promise<ApplicationAdoptionState>;
  labels: {
    adopt: string;
    pending: string;
    description: string;
    saveFirst: string;
    states: Record<ApplicationAdoptionState["status"], string>;
  };
}>) {
  const { dirty } = useAdminUnsavedChanges(),
    router = useRouter(),
    [pending, start] = useTransition(),
    [state, setState] = useState<ApplicationAdoptionState>({ status: "idle" });
  function adopt() {
    if (!enabled || dirty || pending) return;
    start(async () => {
      try {
        const result = await action(input);
        setState(result);
        if (result.status === "adopted" || result.status === "stale")
          router.refresh();
      } catch {
        setState({ status: "unavailable" });
      }
    });
  }
  return (
    <section className="space-y-3 rounded-md border p-4">
      <p className="text-sm">{labels.description}</p>
      <button
        type="button"
        disabled={!enabled || dirty || pending || state.status === "adopted"}
        onClick={adopt}
        className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-50"
      >
        {pending ? labels.pending : labels.adopt}
      </button>
      {dirty ? <p role="status">{labels.saveFirst}</p> : null}
      {state.status !== "idle" ? (
        <p role={state.status === "adopted" ? "status" : "alert"}>
          {labels.states[state.status]}
        </p>
      ) : null}
    </section>
  );
}
