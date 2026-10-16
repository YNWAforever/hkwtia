"use client";
import {useId, useRef, useState, useTransition, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {recordOperationObservationAction} from "@/lib/admin/operations-metrics-actions";
export type OperationsTimingLabels = Readonly<Record<"heading" | "description" | "formLabel" | "caseId" | "caseKind" | "auditId" | "runId" | "comparisonId" | "startedAt" | "endedAt" | "humanMinutes" | "reviewMinutes" | "reworkMinutes" | "waitMinutes" | "cohort" | "baseline" | "assisted" | "decision" | "adopted" | "edited" | "rejected" | "manual" | "reopened" | "submit" | "pending" | "newObservation" | "saved" | "invalid" | "unavailable" | "forbidden" | "application" | "support" | "renewal" | "board" | "content" | "membership" | "event" | "cms", string>>;
export function OperationsTimingForm({labels}: Readonly<{labels: OperationsTimingLabels}>) {
  const receiptId = useRef<string | null>(null);
  const [status, setStatus] = useState<"saved" | "invalid" | "unavailable" | "forbidden" | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fieldId = useId();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    let startedAt: string, endedAt: string;
    try {startedAt = new Date(value("startedAt")).toISOString(); endedAt = new Date(value("endedAt")).toISOString();}
    catch {setStatus("invalid");return;}
    const input = {observationId: receiptId.current ??= crypto.randomUUID(), caseId: value("caseId"), caseKind: value("caseKind"),
      auditId: value("auditId") || null, runId: value("runId") || null, comparisonId: value("comparisonId"),
      startedAt, endedAt, humanMinutes: Number(value("humanMinutes")), reviewMinutes: Number(value("reviewMinutes")),
      reworkMinutes: Number(value("reworkMinutes")), waitMinutes: Number(value("waitMinutes")),
      decision: value("decision"), reopened: data.get("reopened") === "on", cohort: value("cohort")};
    setStatus(null);
    startTransition(async () => {
      try {const result = await recordOperationObservationAction(input);setStatus(result.status);if (result.status === "saved") router.refresh();}
      catch {setStatus("unavailable");}
    });
  }
  const fieldClass = "rounded-md border border-input bg-background px-3 py-2";
  return <details className="rounded-2xl border border-border p-5"><summary className="cursor-pointer font-semibold">{labels.formLabel}</summary>
    <p className="my-4 text-sm text-muted-foreground">{labels.description}</p>
    <form aria-label={labels.formLabel} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {(["caseId", "auditId", "runId", "comparisonId"] as const).map(name => <label key={name} className="grid gap-2 text-sm">{labels[name]}<input className={fieldClass} name={name} required={name === "caseId" || name === "comparisonId"} maxLength={128}/></label>)}
      <div className="grid gap-2 text-sm"><label htmlFor={fieldId + "-caseKind"}>{labels.caseKind}</label><select id={fieldId + "-caseKind"} name="caseKind" className={fieldClass}>{(["application", "support", "renewal", "board", "content", "membership", "event", "cms"] as const).map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></div>
      <div className="grid gap-2 text-sm"><label htmlFor={fieldId + "-cohort"}>{labels.cohort}</label><select id={fieldId + "-cohort"} name="cohort" className={fieldClass}>{(["baseline", "assisted"] as const).map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></div>
      {(["startedAt", "endedAt"] as const).map(name => <label key={name} className="grid gap-2 text-sm">{labels[name]}<input className={fieldClass} name={name} type="datetime-local" required/></label>)}
      {(["humanMinutes", "reviewMinutes", "reworkMinutes", "waitMinutes"] as const).map(name => <label key={name} className="grid gap-2 text-sm">{labels[name]}<input className={fieldClass} name={name} type="number" min="0" max="1440" step="0.01" defaultValue="0" required/></label>)}
      <div className="grid gap-2 text-sm"><label htmlFor={fieldId + "-decision"}>{labels.decision}</label><select id={fieldId + "-decision"} name="decision" className={fieldClass}>{(["manual", "adopted", "edited", "rejected"] as const).map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></div>
      <label className="flex items-center gap-2 text-sm"><input name="reopened" type="checkbox"/>{labels.reopened}</label>
      <div className="flex flex-wrap gap-3 sm:col-span-2"><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" type="submit" disabled={pending}>{pending ? labels.pending : labels.submit}</button>
      <button className="rounded-md border px-4 py-2" type="button" disabled={pending} onClick={() => {receiptId.current = crypto.randomUUID();setStatus(null);}}>{labels.newObservation}</button></div>
      {status ? <p className="text-sm sm:col-span-2" role="status" aria-live="polite">{labels[status]}</p> : null}
    </form>
  </details>;
}
