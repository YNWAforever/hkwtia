"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";

import {prepareAdminBatchAction} from "@/lib/admin/batches/actions";
import {validateMemberImportAction, readMemberImportRunAction, confirmMemberImportAction} from "@/lib/admin/imports/actions";
import type {ImportRunDetail} from "@/lib/db/repos/member-imports";
import type {ImportRunSummary} from "@/lib/admin/imports/service";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";
export type MemberImportLabels = Readonly<{title: string; steps: readonly string[]; upload: string; chooseFile: string; next: string; error: string; fields: Readonly<Record<string, string>>; skip: string; validate: string; preview: string; confirm: string; prepare: string; selectAll: string; selected: string; status: string; reason: string; row: string; before: string; incoming: string; total: string; create: string; update: string; conflict: string; invalid: string; duplicate: string; unchanged: string; limits: string}>;
const fields = ["profileId", "displayName", "email", "locale", "planCode", "renewalAt", "tags", "ownerProfileId"] as const;
export function MemberImportWizard({locale, labels}: {locale: AppLocale; labels: MemberImportLabels}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState("");
  const [headers, setHeaders] = useState<readonly string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [run, setRun] = useState<ImportRunSummary | null>(null);
  const [detail, setDetail] = useState<ImportRunDetail | null>(null);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const attempt = async (work: () => Promise<void>) => {setBusy(true); setError(false); try {await work();} catch {setError(true);} finally {setBusy(false);}};
  const upload = () => attempt(async () => {
    if (!file) return;
    const format = file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : file.name.toLowerCase().endsWith(".csv") ? "csv" : null;
    if (!format) throw new Error("IMPORT_TYPE_UNSUPPORTED");
    const response = await fetch("/api/admin/members/import/upload", {method: "POST", credentials: "same-origin", headers: {"content-type": format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}, body: file});
    if (!response.ok) throw new Error("IMPORT_UPLOAD_FAILED");
    const result = await response.json() as {uploadId: string; headers: string[]; rowCount: number};
    if (!result.uploadId || !Array.isArray(result.headers)) throw new Error("IMPORT_UPLOAD_FAILED");
    setUploadId(result.uploadId); setHeaders(result.headers); setMapping({}); setStep(1);
  });
  const validate = () => attempt(async () => {
    const summary = await validateMemberImportAction({uploadId, mapping});
    const rows = await readMemberImportRunAction(summary.runId);
    setRun(summary); setDetail(rows); setSelected([]); setStep(2);
  });
  const confirm = () => attempt(async () => {
    if (!run) return;
    await confirmMemberImportAction({runId: run.runId, rowNumbers: [...selected]});
    setStep(4);
  });
  const prepare = () => attempt(async () => {
    if (!run) return;
    const {batchId} = await prepareAdminBatchAction({operation: "import_commit", idempotencyKey: crypto.randomUUID(), payload: {importRunId: run.runId}});
    router.push(localizedPath(locale, `/admin/batches/${batchId}`));
  });
  const eligible = detail?.rows.filter((row) => row.status === "create" || row.status === "update") ?? [];
  const visibleRows = detail?.rows.slice(page * 50, page * 50 + 50) ?? [];
  const snapshotText = (values: Readonly<Record<string, unknown>>) => fields.filter((field) => !["profileId", "email"].includes(field) && values[field] !== undefined && values[field] !== null).map((field) => `${labels.fields[field] ?? field}: ${Array.isArray(values[field]) ? (values[field] as string[]).join(", ") : String(values[field])}`).join("; ");
  return <div className="space-y-6">
    <header className="space-y-2"><h1 className="font-serif text-4xl font-semibold">{labels.title}</h1><p className="text-muted-foreground">{labels.limits}</p></header>
    <ol className="flex flex-wrap gap-2" aria-label={labels.title}>{labels.steps.map((name, index) => <li aria-current={step === index ? "step" : undefined} className="rounded-md border px-3 py-2 aria-[current=step]:bg-primary aria-[current=step]:text-primary-foreground" key={name}>{index + 1}. {name}</li>)}</ol>
    {error ? <p className="rounded-md border border-destructive p-3 text-destructive" role="alert">{labels.error}</p> : null}
    {step === 0 ? <div className="space-y-3"><label className="grid gap-2">{labels.chooseFile}<input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file"/></label><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={!file || busy} onClick={upload} type="button">{labels.upload}</button></div> : null}
    {step === 1 ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{fields.map((field) => <label className="grid gap-1" key={field}>{labels.fields[field] ?? field}<select className="min-h-11 rounded-md border bg-background px-2" onChange={(event) => setMapping((current) => {const next = {...current}; if (event.target.value) next[field] = event.target.value; else delete next[field]; return next;})} value={mapping[field] ?? ""}><option value="">{labels.skip}</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={busy || (!mapping.email && !mapping.profileId)} onClick={validate} type="button">{labels.validate}</button></div> : null}
    {step === 2 && run ? <div className="space-y-4"><dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(["total", "create", "update", "unchanged", "duplicate", "conflict", "invalid"] as const).map((key) => <div key={key}><dt>{labels[key]}</dt><dd className="text-2xl font-semibold">{run[key]}</dd></div>)}</dl><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground" onClick={() => setStep(3)} type="button">{labels.preview}</button></div> : null}
    {step === 3 && detail ? <div className="space-y-4"><button className="min-h-11 rounded-md border px-4" onClick={() => setSelected(eligible.map((row) => row.rowNumber))} type="button">{labels.selectAll}</button><p role="status">{labels.selected.replace("{count}", String(selected.length))}</p><div className="overflow-x-auto rounded-md border"><table className="min-w-full text-left text-sm"><thead className="bg-muted"><tr><th className="px-3 py-2" scope="col">{labels.row}</th><th className="px-3 py-2" scope="col">{labels.status}</th><th className="px-3 py-2" scope="col">{labels.fields.email}</th><th className="px-3 py-2" scope="col">{labels.fields.displayName}</th><th className="px-3 py-2" scope="col">{labels.before}</th><th className="px-3 py-2" scope="col">{labels.incoming}</th><th className="px-3 py-2" scope="col">{labels.reason}</th></tr></thead><tbody>{visibleRows.map((row) => {const canSelect = row.status === "create" || row.status === "update"; return <tr className="border-t" key={row.rowNumber}><th className="px-3 py-2" scope="row"><label><input aria-label={`${labels.row} ${row.rowNumber}`} checked={selected.includes(row.rowNumber)} disabled={!canSelect} onChange={() => setSelected((current) => current.includes(row.rowNumber) ? current.filter((value) => value !== row.rowNumber) : [...current, row.rowNumber])} type="checkbox"/> {row.rowNumber}</label></th><td className="px-3 py-2">{labels[row.status] ?? row.status}</td><td className="px-3 py-2">{String(row.values.email ?? "")}</td><td className="px-3 py-2">{String(row.values.displayName ?? "")}</td><td className="px-3 py-2">{snapshotText(row.before ?? {})}</td><td className="px-3 py-2">{snapshotText(row.values)}</td><td className="px-3 py-2">{row.reason ?? ""}</td></tr>;})}</tbody></table></div><nav className="flex gap-2">{page > 0 ? <button className="min-h-11 rounded-md border px-4" onClick={() => setPage(page - 1)} type="button">{labels.steps[3]} {page}</button> : null}{(page + 1) * 50 < detail.rows.length ? <button className="min-h-11 rounded-md border px-4" onClick={() => setPage(page + 1)} type="button">{labels.next}</button> : null}</nav><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={busy || selected.length === 0} onClick={confirm} type="button">{labels.confirm}</button></div> : null}
    {step === 4 && run ? <div className="space-y-3"><p role="status">{labels.selected.replace("{count}", String(selected.length))}</p><button className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={busy} onClick={prepare} type="button">{labels.prepare}</button></div> : null}
  </div>;
}
