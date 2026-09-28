import Link from "next/link";
import {commitAdminBatchAction, retryAdminBatchAction, cancelAdminBatchAction} from "@/lib/admin/batches/actions";
import {BatchProgressPoller} from "@/components/admin/batch-progress";
import {batchRuntimeConfig, type BatchPreview} from "@/lib/admin/batches/types";

export type BatchLabels = Readonly<{title: string; description: string; back: string; states: Record<string, string>; counters: Record<string, string>; total: string; eligible: string; blocked: string; operation: string; target: string; before: string; after: string; reason: string; attempts: string; result: string; commit: string; retry: string; cancel: string; expires: string; empty: string; manualReview: string; more: string}>;

export function BatchPreviewPanel({preview, labels, pageHref}: {preview: BatchPreview; labels: BatchLabels; pageHref?: string}) {
  const ready = preview.state === "ready" && preview.eligible > 0;
  const retryable = ["running", "completed_with_errors"].includes(preview.state) && (preview.retryableFailed ?? preview.items.some(item => item.state === "failed" && item.errorCode?.startsWith("TRANSIENT_") && item.attemptCount < batchRuntimeConfig().maxAttempts));
  const counters = ["pending", "running", "succeeded", "skipped", "failed"] as const;
  return <section className="space-y-6" aria-labelledby="batch-title">
    <BatchProgressPoller state={preview.state}/>
    <header className="space-y-2"><h1 className="font-serif text-4xl font-semibold" id="batch-title">{labels.title}</h1><p className="text-muted-foreground">{labels.description}</p><p className="font-medium" role="status">{labels.states[preview.state] ?? preview.state}</p></header>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div><dt>{labels.total}</dt><dd className="text-2xl font-semibold">{preview.total}</dd></div>
      <div><dt>{labels.eligible}</dt><dd className="text-2xl font-semibold">{preview.eligible}</dd></div>
      <div><dt>{labels.blocked}</dt><dd className="text-2xl font-semibold">{preview.blocked}</dd></div>
      {counters.map((key) => <div key={key}><dt>{labels.counters[key]}</dt><dd className="text-2xl font-semibold">{preview.counters[key]}</dd></div>)}
    </dl>
    {preview.expiresAt && preview.state === "ready" ? <p className="text-sm text-muted-foreground">{labels.expires}: <time dateTime={preview.expiresAt}>{preview.expiresAt}</time></p> : null}
    <div className="flex flex-wrap gap-3">
      {ready ? <form action={commitAdminBatchAction.bind(null, preview.batchId, preview.digest)}><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground" type="submit">{labels.commit}</button></form> : null}
      {retryable ? <form action={retryAdminBatchAction.bind(null, preview.batchId)}><button className="min-h-11 rounded-md border px-4" type="submit">{labels.retry}</button></form> : null}
      {["ready", "queued", "running"].includes(preview.state) ? <form action={cancelAdminBatchAction.bind(null, preview.batchId)}><button className="min-h-11 rounded-md border px-4" type="submit">{labels.cancel}</button></form> : null}
    </div>
    {preview.counters.failed > 0 && !retryable ? <p className="rounded-md border p-3 text-sm" role="status">{labels.manualReview}</p> : null}
    {preview.items.length ? <div className="overflow-x-auto rounded-md border"><table className="min-w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-2" scope="col">{labels.target}</th><th className="px-3 py-2" scope="col">{labels.operation}</th><th className="px-3 py-2" scope="col">{labels.before}</th><th className="px-3 py-2" scope="col">{labels.after}</th><th className="px-3 py-2" scope="col">{labels.reason}</th><th className="px-3 py-2" scope="col">{labels.attempts}</th><th className="px-3 py-2" scope="col">{labels.result}</th></tr></thead><tbody>{preview.items.map((item) => <tr className="border-t" key={`${item.target.type}:${item.target.id}`}><th className="px-3 py-2" scope="row">{item.target.id}</th><td className="px-3 py-2">{labels.states[item.state] ?? item.state}</td><td className="px-3 py-2">{Object.entries(item.before).map(([key,value]) => `${key}: ${String(value)}`).join(", ")}</td><td className="px-3 py-2">{Object.entries(item.after).map(([key,value]) => `${key}: ${String(value)}`).join(", ")}</td><td className="px-3 py-2">{item.errorCode ?? item.reasonCode ?? ""}</td><td className="px-3 py-2">{item.attemptCount}</td><td className="px-3 py-2">{item.resultRef ?? ""}</td></tr>)}</tbody></table></div> : <p className="text-muted-foreground">{labels.empty}</p>}
    {preview.nextCursor && pageHref ? <Link className="inline-flex min-h-11 items-center text-primary underline" href={`${pageHref}?cursor=${encodeURIComponent(preview.nextCursor)}`}>{labels.more}</Link> : null}
  </section>;
}
