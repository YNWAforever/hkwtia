"use client";

import {useActionState} from "react";

import type {ApprovalActionState} from "@/lib/admin/approval-action-core";
import type {PendingApproval} from "@/lib/db/repos/approvals";

type ApprovalAction = (state: ApprovalActionState, formData: FormData) => Promise<ApprovalActionState>;
type Labels = Readonly<{
  caption: string; empty: string; actionType: string; requestedAt: string; summary: string; actions: string;
  approve: string; reject: string; deciding: string; unavailable: string;
  actionTypes: Readonly<Record<string, string>>;
  summaryFields: Readonly<Record<string, string>>;
}>;

function DecisionForm({action, approvalId, decision, labels}: Readonly<{action: ApprovalAction; approvalId: string; decision: "approved" | "rejected"; labels: Labels}>) {
  const [state, formAction, pending] = useActionState(action, {});
  const label = decision === "approved" ? labels.approve : labels.reject;
  return <form action={formAction} className="space-y-1">
    <input name="approvalId" type="hidden" value={approvalId}/>
    <button className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60" disabled={pending} name="decision" type="submit" value={decision}>{pending ? labels.deciding : label}</button>
    <span aria-live="polite" className={state.status === "error" ? "block text-xs text-destructive" : "block text-xs text-muted-foreground"} role={state.status === "error" ? "alert" : "status"}>{state.message ?? ""}</span>
  </form>;
}

export function ApprovalList({approvals, labels, action, locale}: Readonly<{approvals: readonly PendingApproval[]; labels: Labels; action: ApprovalAction; locale: string}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  if (approvals.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return <div className="overflow-x-auto rounded-md border border-border"><table className="min-w-full text-left text-sm">
    <caption className="caption-top px-4 py-3 text-left font-medium text-foreground">{labels.caption}</caption>
    <thead className="border-y border-border bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3" scope="col">{labels.actionType}</th><th className="px-4 py-3" scope="col">{labels.requestedAt}</th><th className="px-4 py-3" scope="col">{labels.summary}</th><th className="px-4 py-3" scope="col">{labels.actions}</th></tr></thead>
    <tbody>{approvals.map((approval) => <tr className="border-b border-border last:border-0" key={approval.id}>
      <th className="px-4 py-3 font-medium" scope="row">{labels.actionTypes[approval.actionType] ?? approval.actionType}</th>
      <td className="px-4 py-3">{formatter.format(approval.requestedAt)}</td>
      <td className="px-4 py-3">{approval.payloadSummary.length ? <dl className="space-y-1">{approval.payloadSummary.map((item) => <div className="grid grid-cols-[auto_1fr] gap-2" key={item.key}><dt className="font-medium">{labels.summaryFields[item.key] ?? labels.unavailable}</dt><dd className="break-all">{item.value}</dd></div>)}</dl> : labels.unavailable}</td>
      <td className="px-4 py-3"><div className="flex flex-wrap gap-2"><DecisionForm action={action} approvalId={approval.id} decision="approved" labels={labels}/><DecisionForm action={action} approvalId={approval.id} decision="rejected" labels={labels}/></div></td>
    </tr>)}</tbody>
  </table></div>;
}
