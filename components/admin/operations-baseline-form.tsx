"use client";
import {useState, useTransition, type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {freezeOperationBaselineAction} from "@/lib/admin/operations-metrics-actions";
export type OperationsBaselineLabels = Readonly<Record<"freezeHeading" | "freezeDescription" | "comparisonId" | "baselineFrom" | "baselineTo" | "freezeSubmit" | "freezeSaved" | "pending" | "invalid" | "unavailable" | "forbidden", string>>;
export function OperationsBaselineForm({labels}: Readonly<{labels: OperationsBaselineLabels}>) {
 const [status, setStatus] = useState<"saved" | "invalid" | "unavailable" | "forbidden" | null>(null);
 const [pending, startTransition] = useTransition();
 const router = useRouter();
 function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  let from: string, toExclusive: string;
  try {from = new Date(String(data.get("from"))).toISOString();toExclusive = new Date(String(data.get("toExclusive"))).toISOString();}
  catch {setStatus("invalid");return;}
  const input = {comparisonId: String(data.get("comparisonId") ?? ""), from, toExclusive};
  setStatus(null);
  startTransition(async () => {
   try {const result = await freezeOperationBaselineAction(input);setStatus(result.status);if (result.status === "saved") router.refresh();}
   catch {setStatus("unavailable");}
  });
 }
 return <details className="rounded-2xl border border-border p-5"><summary className="cursor-pointer font-semibold">{labels.freezeHeading}</summary>
  <p className="my-4 text-sm text-muted-foreground">{labels.freezeDescription}</p>
  <form aria-label={labels.freezeHeading} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
   {(["comparisonId", "from", "toExclusive"] as const).map(name => <label key={name} className="grid gap-2 text-sm">{labels[name === "from" ? "baselineFrom" : name === "toExclusive" ? "baselineTo" : name]}
    <input name={name} type={name === "comparisonId" ? "text" : "datetime-local"} maxLength={36} required className="rounded-md border border-input bg-background px-3 py-2"/>
   </label>)}
   <div className="sm:col-span-2"><button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">{pending ? labels.pending : labels.freezeSubmit}</button></div>
   {status ? <p role="status" aria-live="polite" className="text-sm sm:col-span-2">{labels[status === "saved" ? "freezeSaved" : status]}</p> : null}
  </form>
 </details>;
}
