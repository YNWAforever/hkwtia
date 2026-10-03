"use client";
import { useActionState, useState, useRef, useEffect } from "react";
import type { ApplicationCase } from "@/lib/admin/application-case-types";
import { useAdminUnsavedChanges } from "@/components/admin/unsaved-changes-guard";
import type { ApplicationDraftState } from "@/lib/admin/application-draft-actions";
import type { ApplicationTriage } from "@/lib/ai/application-triage";
import type { ApplicationCaseState } from "@/lib/admin/application-case-actions";
export type ApplicationCaseLabels = Readonly<{
  title: string;
  description: string;
  owner: string;
  unassigned: string;
  due: string;
  missing: string;
  nextAction: string;
  note: string;
  save: string;
  saving: string;
  saved: string;
  conflict: string;
  error: string;
  refresh: string;
  missingFields: Readonly<Record<string, string>>;
  nextActions: Readonly<Record<string, string>>;
}>;
export type ApplicationTriageProposal = Readonly<{
  factsHash: string;
  caseVersion: string;
  triage: ApplicationTriage;
  note: string;
  validationMessages?: readonly string[];
  labels: Readonly<{
    organize: string;
    apply: string;
    ruleOnly: string;
    noneMissing: string;
    validation: string;
    stale: string;
    noteKept: string;
    description: string;
  }>;
}>;
export function ApplicationCaseForm({
  record,
  owners,
  labels,
  action,
  refreshHref,
  triageProposal,
  draftRequest,
}: Readonly<{
  record: ApplicationCase;
  owners: readonly Readonly<{
    id: string;
    name: string;
  }>[];
  labels: ApplicationCaseLabels;
  action: (
    state: ApplicationCaseState,
    data: FormData,
  ) => Promise<ApplicationCaseState>;
  refreshHref: string;
  triageProposal?: ApplicationTriageProposal | null;
  draftRequest?: Readonly<{
    localReviewPath?: string;
    enabled: boolean;
    action: () => Promise<ApplicationDraftState>;
    labels: Readonly<{
      request: string;
      requesting: string;
      disabled: string;
      review: string;
      states: Readonly<Record<ApplicationDraftState["status"], string>>;
    }>;
  }>;
}>) {
  const sequence = useRef(0),
    [dirty, setDirty] = useState(false),
    guard = useAdminUnsavedChanges();
  const { setDirty: guardSetDirty } = guard;
  const markDirty = () => {
    sequence.current++;
    setDirty(true);
  };
  const [state, submit, pending] = useActionState<
    ApplicationCaseState,
    FormData
  >(
    async (previous, data) => {
      const version = sequence.current,
        result = await action(previous, data);
      if (result.status === "saved" && sequence.current === version)
        setDirty(false);
      return result;
    },
    { status: "idle" },
  );
  useEffect(() => {
    guardSetDirty(dirty);
    return () => guardSetDirty(false);
  }, [dirty, guardSetDirty]);
  const [preparing, setPreparing] = useState(false),
    [draftState, setDraftState] = useState<ApplicationDraftState>({
      status: "idle",
    });
  async function requestDraft() {
    if (!draftRequest?.enabled || preparing) return;
    setPreparing(true);
    try {
      setDraftState(await draftRequest.action());
    } catch {
      setDraftState({ status: "unavailable" });
    } finally {
      setPreparing(false);
    }
  }
  // Keep unsaved fields attached to the version loaded when editing began.
  const [loadedVersion] = useState(record.version);
  const [selectedMissing, setSelectedMissing] = useState<readonly string[]>(
    record.missingFields,
  );
  const [nextAction, setNextAction] = useState(record.nextActionCode),
    [note, setNote] = useState("");
  const [showProposal, setShowProposal] = useState(false),
    [keptNote, setKeptNote] = useState(false);
  const [loadedProposalHash] = useState(triageProposal?.factsHash);
  const staleProposal = Boolean(
    triageProposal &&
    (triageProposal.factsHash !== loadedProposalHash ||
      triageProposal.caseVersion !== loadedVersion ||
      (state.version && state.version !== triageProposal.caseVersion)),
  );
  function applyProposal() {
    if (!triageProposal || staleProposal) return;
    markDirty();
    setSelectedMissing(triageProposal.triage.missingFields);
    setNextAction(triageProposal.triage.nextActionCode);
    if (note.trim()) setKeptNote(true);
    else {
      setNote(triageProposal.note.slice(0, 1000));
      setKeptNote(false);
    }
  }
  let reviewHref = draftState.reviewHref;
  if (reviewHref && draftRequest?.localReviewPath) {
    const selected = new URL(
      reviewHref,
      "https://local.invalid",
    ).searchParams.get("draft");
    if (
      selected &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        selected,
      )
    ) {
      const local = new URL(
        draftRequest.localReviewPath,
        "https://local.invalid",
      );
      local.searchParams.set("draft", selected);
      reviewHref = local.pathname + local.search;
    }
  }
  const dueValue = record.dueAt
    ? new Date(Date.parse(record.dueAt) + 8 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16)
    : "";
  return (
    <form
      action={submit}
      onChange={markDirty}
      className="glass-card space-y-5 p-5 sm:p-6"
    >
      <h2 className="font-serif text-2xl">{labels.title}</h2>
      <p className="text-sm text-muted-foreground">{labels.description}</p>
      {triageProposal ? (
        <section className="space-y-3 rounded-md border p-4">
          <button
            type="button"
            aria-expanded={showProposal}
            onClick={() => setShowProposal((value) => !value)}
            className="min-h-11 rounded-md border px-4 py-2"
          >
            {triageProposal.labels.organize}
          </button>
          {showProposal ? (
            <div className="space-y-3">
              <p className="font-medium">{triageProposal.labels.ruleOnly}</p>
              <p className="text-sm text-muted-foreground">
                {triageProposal.labels.description}
              </p>
              <p>
                {triageProposal.triage.missingFields.length
                  ? triageProposal.triage.missingFields
                      .map(
                        (field) =>
                          labels.missingFields[field] ?? labels.missing,
                      )
                      .join("、")
                  : triageProposal.labels.noneMissing}
              </p>
              {triageProposal.triage.validationIssues.length ? (
                <p role="status">
                  {triageProposal.labels.validation}
                  {triageProposal.validationMessages?.length
                    ? ": " + triageProposal.validationMessages.join("、")
                    : ""}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap text-sm">
                {triageProposal.note}
              </p>
              {staleProposal ? (
                <p role="alert">{triageProposal.labels.stale}</p>
              ) : null}
              {keptNote ? (
                <p role="status">{triageProposal.labels.noteKept}</p>
              ) : null}
              <button
                type="button"
                disabled={pending || staleProposal}
                onClick={applyProposal}
                className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-50"
              >
                {triageProposal.labels.apply}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {draftRequest ? (
        <section className="space-y-3 rounded-md border p-4">
          <button
            type="button"
            disabled={!draftRequest.enabled || preparing}
            onClick={requestDraft}
            className="min-h-11 rounded-md border px-4 py-2 disabled:opacity-50"
          >
            {preparing
              ? draftRequest.labels.requesting
              : draftRequest.labels.request}
          </button>
          {!draftRequest.enabled ? (
            <p className="text-sm">{draftRequest.labels.disabled}</p>
          ) : null}
          {draftState.status !== "idle" ? (
            <p
              role={
                ["created", "disabled"].includes(draftState.status)
                  ? "status"
                  : "alert"
              }
            >
              {draftRequest.labels.states[draftState.status]}
            </p>
          ) : null}
          {reviewHref ? (
            <a
              className="inline-flex min-h-11 items-center text-primary underline"
              href={reviewHref}
            >
              {draftRequest.labels.review}
            </a>
          ) : null}
        </section>
      ) : null}
      <input
        type="hidden"
        name="expectedVersion"
        value={state.version ?? loadedVersion}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          {labels.owner}
          <select
            aria-label={labels.owner}
            name="ownerProfileId"
            className="min-h-11 rounded-md border bg-background px-3"
            defaultValue={record.ownerProfileId ?? ""}
          >
            <option value="">{labels.unassigned}</option>
            {owners.map((owner) => (
              <option value={owner.id} key={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          {labels.due}
          <input
            aria-label={labels.due}
            name="dueAt"
            type="datetime-local"
            defaultValue={dueValue}
            className="min-h-11 min-w-0 rounded-md border bg-background px-3"
          />
        </label>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-medium">{labels.missing}</legend>
        {Object.entries(labels.missingFields).map(([value, label]) => (
          <label className="flex min-h-11 items-center gap-3" key={value}>
            <input
              name="missingFields"
              type="checkbox"
              value={value}
              checked={selectedMissing.includes(value)}
              onChange={(event) =>
                setSelectedMissing((current) =>
                  event.target.checked
                    ? [...current, value]
                    : current.filter((field) => field !== value),
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-2">
        {labels.nextAction}
        <select
          aria-label={labels.nextAction}
          name="nextActionCode"
          className="min-h-11 rounded-md border bg-background px-3"
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
        >
          {Object.entries(labels.nextActions).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        {labels.note}
        <textarea
          aria-label={labels.note}
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          required
          rows={3}
          className="rounded-md border bg-background p-3"
        />
      </label>
      {state.status !== "idle" ? (
        <p role={state.status === "saved" ? "status" : "alert"}>
          {labels[state.status]}
          {state.status === "conflict" ? (
            <a
              className="ml-3 inline-flex min-h-11 items-center text-primary underline"
              href={refreshHref}
            >
              {labels.refresh}
            </a>
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
