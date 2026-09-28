import Link from "next/link";
import {commitAdminBatchAction, retryAdminBatchAction, cancelAdminBatchAction} from "@/lib/admin/batches/actions";
import {BatchProgressPoller} from "@/components/admin/batch-progress";
import {batchRuntimeConfig, type BatchPreview, type BatchProgressItem} from "@/lib/admin/batches/types";

export type BatchLabels = Readonly<{
  title: string; description: string; back: string; states: Record<string, string>; counters: Record<string, string>;
  total: string; eligible: string; blocked: string; operation: string; target: string; before: string; after: string;
  reason: string; attempts: string; result: string; commit: string; retry: string; cancel: string; expires: string;
  empty: string; manualReview: string; more: string; progressUnavailable: string; locale: string;
  change: string; noChange: string; idLabel: string; targetTypes: Record<string, string>;
  fieldNames: Record<string, string>; reasonTransient: string; reasonChanged: string;
  reasonUnchanged: string; reasonOther: string;
}>;

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function targetName(item: BatchProgressItem): string | null {
  for (const key of ["targetName", "displayName", "companyName", "memberName"]) {
    const value = item.before[key] ?? item.after[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function reasonLabel(code: string, labels: BatchLabels): string {
  if (code.startsWith("TRANSIENT_")) return labels.reasonTransient;
  if (code === "UNCHANGED") return labels.reasonUnchanged;
  if (code.includes("CHANGED") || code.includes("VERSION")) return labels.reasonChanged;
  return labels.reasonOther;
}

export function BatchPreviewPanel({preview, labels, pageHref}: {preview: BatchPreview; labels: BatchLabels; pageHref?: string}) {
  const ready = preview.state === "ready" && preview.eligible > 0;
  const retryable = ["running", "completed_with_errors"].includes(preview.state) && (preview.retryableFailed ?? preview.items.some(item => item.state === "failed" && item.errorCode?.startsWith("TRANSIENT_") && item.attemptCount < batchRuntimeConfig().maxAttempts));
  const expires = preview.expiresAt && preview.state === "ready"
    ? new Intl.DateTimeFormat(labels.locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"}).format(new Date(preview.expiresAt)) : null;

  return <section className="space-y-6" aria-labelledby="batch-title">
    <header className="space-y-2"><h1 className="font-serif text-4xl font-semibold" id="batch-title">{labels.title}</h1><p className="text-muted-foreground">{labels.description}</p></header>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div><dt>{labels.total}</dt><dd className="text-2xl font-semibold">{preview.total}</dd></div>
      <div><dt>{labels.eligible}</dt><dd className="text-2xl font-semibold">{preview.eligible}</dd></div>
      <div><dt>{labels.blocked}</dt><dd className="text-2xl font-semibold">{preview.blocked}</dd></div>
    </dl>
    <BatchProgressPoller batchId={preview.batchId} state={preview.state} counters={preview.counters} labels={{states: labels.states, counters: labels.counters, unavailable: labels.progressUnavailable}}/>
    {expires ? <p className="text-sm text-muted-foreground">{labels.expires}: <time dateTime={preview.expiresAt}>{expires}</time></p> : null}
    <div className="flex flex-wrap gap-3">
      {ready ? <form action={commitAdminBatchAction.bind(null, preview.batchId, preview.digest)}><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground" type="submit">{labels.commit}</button></form> : null}
      {retryable ? <form action={retryAdminBatchAction.bind(null, preview.batchId)}><button className="min-h-11 rounded-md border px-4" type="submit">{labels.retry}</button></form> : null}
      {["ready", "queued", "running"].includes(preview.state) ? <form action={cancelAdminBatchAction.bind(null, preview.batchId)}><button className="min-h-11 rounded-md border px-4" type="submit">{labels.cancel}</button></form> : null}
    </div>
    {preview.counters.failed > 0 && !retryable ? <p className="rounded-md border p-3 text-sm" role="status">{labels.manualReview}</p> : null}
    {preview.items.length ? <div className="overflow-x-auto rounded-md border"><table className="min-w-full text-left text-sm">
      <thead className="bg-muted"><tr>
        <th className="px-3 py-2" scope="col">{labels.target}</th>
        <th className="px-3 py-2" scope="col">{labels.operation}</th>
        <th className="px-3 py-2" scope="col">{labels.change}</th>
        <th className="px-3 py-2" scope="col">{labels.reason}</th>
        <th className="px-3 py-2" scope="col">{labels.attempts}</th>
        <th className="px-3 py-2" scope="col">{labels.result}</th>
      </tr></thead>
      <tbody>{preview.items.map(item => {
        const differences = [...new Set([...Object.keys(item.before), ...Object.keys(item.after)])]
          .filter(key => JSON.stringify(item.before[key]) !== JSON.stringify(item.after[key]));
        const code = item.errorCode ?? item.reasonCode;
        return <tr className="border-t align-top" key={`${item.target.type}:${item.target.id}`}>
          <th className="px-3 py-2" scope="row">
            <span className="block font-medium">{targetName(item) ?? labels.targetTypes[item.target.type] ?? item.target.type}</span>
            <code className="block break-all text-xs font-normal text-muted-foreground">{labels.idLabel}: {item.target.id}</code>
          </th>
          <td className="px-3 py-2">{labels.states[item.state] ?? item.state}</td>
          <td className="px-3 py-2">{differences.length ? differences.map(key => <p key={key}>{labels.fieldNames[key] ?? key}: {valueText(item.before[key])} → {valueText(item.after[key])}</p>) : labels.noChange}</td>
          <td className="px-3 py-2">{code ? <><span className="block">{reasonLabel(code, labels)}</span><code className="block break-all text-xs text-muted-foreground">{code}</code></> : null}</td>
          <td className="px-3 py-2">{item.attemptCount}</td>
          <td className="px-3 py-2">{item.resultRef ?? ""}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="text-muted-foreground">{labels.empty}</p>}
    {preview.nextCursor && pageHref ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={`${pageHref}?cursor=${encodeURIComponent(preview.nextCursor)}`}>{labels.more}</Link> : null}
  </section>;
}