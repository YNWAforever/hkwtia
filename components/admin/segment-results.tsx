"use client";

import {useActionState} from "react";

import type {SegmentPreview} from "@/lib/admin/segments";
import type {SavedSegmentRecord} from "@/lib/db/repos/segments";

export type SegmentResultsLabels = Readonly<{caption: string; total: string; empty: string; kind: string; kindMember: string; kindContact: string; name: string; email: string; company: string; plan: string; status: string; renewal: string; score: string; unavailable: string; saved: string; export: string; queue: string; template: string; templateRenewal: string; templateUpdate: string; queued: string; existing: string; recipients: string; newDraft: string; error: string}>;
export type QueueActionState = Readonly<{disposition: "created" | "existing" | null; recipientCount: number; error: "generic" | null}>;
type QueueAction = (state: QueueActionState, formData: FormData) => Promise<QueueActionState>;
type Props = Readonly<{labels: SegmentResultsLabels; preview: SegmentPreview; saved: readonly SavedSegmentRecord[]; queueAction: QueueAction; newDraftHref: string}>;

function CampaignQueueForm({action, labels, segmentId}: Readonly<{action: QueueAction; labels: SegmentResultsLabels; segmentId: string}>) {
  const [state, formAction, pending] = useActionState(action, {disposition: null, recipientCount: 0, error: null});
  const message = state.disposition ? `${state.disposition === "created" ? labels.queued : labels.existing}: ${state.recipientCount} ${labels.recipients}` : null;
  return <form action={formAction} className="flex flex-wrap items-end gap-2"><input name="segmentId" type="hidden" value={segmentId}/><label className="grid gap-1 text-sm"><span>{labels.template}</span><select className="rounded-md border border-input bg-background px-3 py-2" defaultValue="renewal-reminder" name="template"><option value="renewal-reminder">{labels.templateRenewal}</option><option value="member-update">{labels.templateUpdate}</option></select></label><button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" disabled={pending} type="submit">{labels.queue}</button>{message ? <p aria-live="polite" className="basis-full text-sm text-muted-foreground">{message}</p> : null}{state.error ? <p aria-live="polite" className="basis-full text-sm text-destructive">{labels.error}</p> : null}</form>;
}

export function SegmentResults({labels, preview, saved, queueAction, newDraftHref}: Props) {
  // C-6: `kind` leads the table for the same reason it leads the CSV header —
  // the membership columns are blank for a contact and the contact columns are
  // blank for a member, so the row is unreadable until you know which arm it
  // came from. The React key is `${kind}:${id}`: a profile id and a contact id
  // are drawn from different tables and can collide.
  const columns = [labels.kind, labels.name, labels.email, labels.company, labels.plan, labels.status, labels.renewal, labels.score];
  return <div className="space-y-6"><p className="text-sm text-muted-foreground">{labels.total}: {preview.total}</p><div className="overflow-x-auto rounded-md border border-border"><table className="min-w-full text-left text-sm"><caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption><thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr>{columns.map((label) => <th className="px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead><tbody>{preview.items.map((row) => <tr className="border-b border-border last:border-0" key={`${row.kind}:${row.id}`}><td className="px-4 py-3">{row.kind === "member" ? labels.kindMember : labels.kindContact}</td><th className="px-4 py-3 font-medium" scope="row">{row.displayName}</th><td className="px-4 py-3">{row.email ?? labels.unavailable}</td><td className="px-4 py-3">{row.companyName ?? labels.unavailable}</td><td className="px-4 py-3">{row.planCode ?? labels.unavailable}</td><td className="px-4 py-3">{row.membershipStatus ?? labels.unavailable}</td><td className="px-4 py-3">{row.renewalAt ?? labels.unavailable}</td><td className="px-4 py-3">{row.score ?? labels.unavailable}</td></tr>)}</tbody></table>{preview.items.length === 0 ? <p className="px-4 py-6 text-muted-foreground">{labels.empty}</p> : null}</div><section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl font-semibold">{labels.saved}</h2><a className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted" href={newDraftHref}>{labels.newDraft}</a></div>{saved.length === 0 ? <p className="text-sm text-muted-foreground">{labels.empty}</p> : <ul className="divide-y divide-border rounded-md border border-border">{saved.map((segment) => <li className="space-y-3 px-4 py-3" key={segment.id}><div className="flex items-center justify-between gap-4"><span>{segment.nameEn}</span><a className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted" href={`/api/admin/segments/${segment.id}/export`}>{labels.export}</a></div><CampaignQueueForm action={queueAction} labels={labels} segmentId={segment.id}/></li>)}</ul>}</section></div>;
}