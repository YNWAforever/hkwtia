import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {OpenStaffTask} from "@/lib/db/repos/staff-tasks";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  kind: string; summary: string; member: string; conversation: string; created: string;
  actions: string; resolve: string; openConversation: string; empty: string;
  leadEmail: string; leadEmailBlocked: string; leadEmailUncertain: string;
  leadAck: string; leadStaff: string;
  ticketEmail: string; ticketEmailBlocked: string; ticketEmailUncertain: string;
  ticketRefundPending: string; ticketConfirmation: string; ticketPass: string;
  ticketRefund: string; ticketRefundFailed: string; ticketOrder: string;
}>;

function taskSummary(task: OpenStaffTask, labels: Labels): string {
  if (task.kind === "showcase_lead_email") {
    return task.summaryCode === "showcase_lead_email_uncertain"
      ? labels.leadEmailUncertain : labels.leadEmailBlocked;
  }
  if (task.kind === "ticket_email") {
    if (task.summaryCode === "ticket_email_uncertain") return labels.ticketEmailUncertain;
    if (task.summaryCode === "ticket_refund_provider_pending") return labels.ticketRefundPending;
    return labels.ticketEmailBlocked;
  }
  return task.summaryCode;
}

function noticeLabel(task: OpenStaffTask, labels: Labels): string | null {
  if (task.kind === "showcase_lead_email") {
    if (task.context.noticeKind === "ack") return labels.leadAck;
    if (task.context.noticeKind === "staff") return labels.leadStaff;
  }
  if (task.kind === "ticket_email") {
    switch (task.context.noticeKind) {
      case "confirmation": return labels.ticketConfirmation;
      case "pass": return labels.ticketPass;
      case "refund": return labels.ticketRefund;
      case "refund_failed": return labels.ticketRefundFailed;
      default: return null;
    }
  }
  return null;
}

export function TaskTable({locale, tasks, labels, action}: Readonly<{
  locale: AppLocale; tasks: readonly OpenStaffTask[]; labels: Labels;
  action: (formData: FormData) => Promise<void>;
}>) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong",
  });
  if (tasks.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className="p-3">{labels.kind}</th><th className="p-3">{labels.summary}</th><th className="p-3">{labels.member}</th><th className="p-3">{labels.conversation}</th><th className="p-3">{labels.created}</th><th className="p-3">{labels.actions}</th></tr></thead>
        <tbody>
          {tasks.map((task) => {
            const notice = noticeLabel(task, labels);
            return (
              <tr className="border-t border-border" key={task.id}>
                <td className="p-3">{task.kind === "showcase_lead_email" ? labels.leadEmail
                  : task.kind === "ticket_email" ? labels.ticketEmail : task.kind}</td>
                <td className="p-3">
                  <div>{taskSummary(task, labels)}</div>
                  {notice ? <div className="text-muted-foreground">{notice}</div> : null}
                  {task.context.orderId ? <div className="text-muted-foreground">{labels.ticketOrder}: <span>{task.context.orderId}</span></div> : null}
                  {task.context.contactEmail ? <div className="text-muted-foreground">{task.context.contactEmail}</div> : null}
                </td>
                <td className="p-3">{task.profileId ?? ""}</td>
                <td className="p-3">{task.context.conversationId ? <Link className="text-primary underline" href={localizedPath(locale, "/admin/inbox/" + task.context.conversationId)}>{labels.openConversation}</Link> : ""}</td>
                <td className="p-3"><time dateTime={task.createdAt.toISOString()}>{formatter.format(task.createdAt)}</time></td>
                <td className="p-3"><form action={action}><input name="taskId" type="hidden" value={task.id} /><button className="rounded-md border border-border px-3 py-1" type="submit">{labels.resolve}</button></form></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
