import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {OpenStaffTask} from "@/lib/db/repos/staff-tasks";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{kind: string; summary: string; member: string; conversation: string; created: string; actions: string; resolve: string; openConversation: string; empty: string}>;

export function TaskTable({locale, tasks, labels, action}: Readonly<{locale: AppLocale; tasks: readonly OpenStaffTask[]; labels: Labels; action: (formData: FormData) => Promise<void>}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  if (tasks.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className="p-3">{labels.kind}</th><th className="p-3">{labels.summary}</th><th className="p-3">{labels.member}</th><th className="p-3">{labels.conversation}</th><th className="p-3">{labels.created}</th><th className="p-3">{labels.actions}</th></tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr className="border-t border-border" key={task.id}>
              <td className="p-3">{task.kind}</td>
              <td className="p-3">{task.summaryCode}</td>
              <td className="p-3">{task.profileId ?? ""}</td>
              <td className="p-3">{task.context.conversationId ? <Link className="text-primary underline" href={localizedPath(locale, `/admin/inbox/${task.context.conversationId}`)}>{labels.openConversation}</Link> : ""}</td>
              <td className="p-3"><time dateTime={task.createdAt.toISOString()}>{formatter.format(task.createdAt)}</time></td>
              <td className="p-3"><form action={action}><input name="taskId" type="hidden" value={task.id} /><button className="rounded-md border border-border px-3 py-1" type="submit">{labels.resolve}</button></form></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
