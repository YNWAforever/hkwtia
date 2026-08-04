"use client";

import {useActionState} from "react";

import type {CohortMoveActionState} from "@/lib/admin/cohort-actions";
import type {CohortStage} from "@/lib/launchpad/contracts";

const stages: readonly CohortStage[] = ["applied", "accepted", "ready", "match", "land", "scale", "graduated", "rejected"];
const allowedMoves: Readonly<Record<CohortStage, readonly CohortStage[]>> = {
  applied: ["accepted", "rejected"],
  accepted: ["ready", "rejected"],
  ready: ["match", "rejected"],
  match: ["land", "rejected"],
  land: ["scale", "rejected"],
  scale: ["graduated", "rejected"],
  graduated: [],
  rejected: [],
};

export type CohortKanbanLabels = Readonly<{
  title: string;
  description: string;
  application: string;
  moveTo: string;
  notes: string;
  move: string;
  moving: string;
  empty: string;
  errors: Readonly<{invalid: string; forbidden: string; error: string}>;
  stages: Readonly<Record<CohortStage, string>>;
}>;

type Action = (formData: FormData) => Promise<CohortMoveActionState>;
export type CohortKanbanApplication = Readonly<{id: string; stage: CohortStage}>;
const initialState: CohortMoveActionState = {status: "idle"};

function statusMessage(state: CohortMoveActionState, labels: CohortKanbanLabels) {
  if (state.status === "invalid") return labels.errors.invalid;
  if (state.status === "forbidden") return labels.errors.forbidden;
  if (state.status === "error") return labels.errors.error;
  return "";
}

function CohortApplicationCard({application, action, labels}: Readonly<{
  application: CohortKanbanApplication;
  action: Action;
  labels: CohortKanbanLabels;
}>) {
  const [state, formAction, pending] = useActionState(
    async (_previous: CohortMoveActionState, formData: FormData) => action(formData),
    initialState,
  );
  const nextStages = allowedMoves[application.stage];
  const message = statusMessage(state, labels);
  const controlId = application.id;

  return <article className="space-y-3 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
    <p className="text-sm font-medium">{labels.application} {application.id}</p>
    {nextStages.length > 0 ? <form action={formAction} className="space-y-3">
      <input name="applicationId" type="hidden" value={application.id}/>
      <label className="block space-y-1 text-sm" htmlFor={`cohort-stage-${controlId}`}><span>{labels.moveTo}</span><select aria-describedby={`cohort-status-${controlId}`} aria-label={`${labels.moveTo}: ${application.id}`} className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={nextStages[0]} id={`cohort-stage-${controlId}`} name="stage">{nextStages.map((stage) => <option key={stage} value={stage}>{labels.stages[stage]}</option>)}</select></label>
      <label className="block space-y-1 text-sm" htmlFor={`cohort-notes-${controlId}`}><span>{labels.notes}</span><textarea aria-describedby={`cohort-status-${controlId}`} aria-label={`${labels.notes}: ${application.id}`} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2" id={`cohort-notes-${controlId}`} maxLength={4000} name="notes" rows={3}/></label>
      <button className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{pending ? labels.moving : labels.move}</button>
      <p aria-live="polite" className="text-sm text-destructive" id={`cohort-status-${controlId}`} role={message ? "alert" : "status"}>{message}</p>
    </form> : null}
  </article>;
}

export function CohortKanban({applications, labels, moveAction}: Readonly<{
  applications: readonly CohortKanbanApplication[];
  labels: CohortKanbanLabels;
  moveAction: Action;
}>) {
  return <section aria-labelledby="cohort-kanban-title" className="space-y-5"><header className="space-y-2"><h1 className="font-serif text-4xl font-semibold" id="cohort-kanban-title">{labels.title}</h1><p className="text-muted-foreground">{labels.description}</p></header><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{stages.map((stage) => {
    const rows = applications.filter((application) => application.stage === stage);
    return <section aria-labelledby={`cohort-stage-heading-${stage}`} className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4" key={stage}><h2 className="font-serif text-xl font-semibold" id={`cohort-stage-heading-${stage}`}>{labels.stages[stage]}</h2>{rows.length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : rows.map((application) => <CohortApplicationCard action={moveAction} application={application} key={application.id} labels={labels}/>)}</section>;
  })}</div></section>;
}
