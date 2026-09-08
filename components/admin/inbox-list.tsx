import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {InboxConversationSummary} from "@/lib/db/repos/inbox";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{owner: string; channel: string; last: string; when: string; messages: string; status: string; anonymous: string; escalated: string; empty: string; open: string; filters: Readonly<{all: string; whatsapp: string; web: string}>}>;

export function InboxList({locale, rows, labels, channel}: Readonly<{locale: AppLocale; rows: readonly InboxConversationSummary[]; labels: Labels; channel: "all" | "whatsapp" | "web"}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return (
    <div className="space-y-4">
      <nav aria-label={labels.channel} className="flex gap-2">
        {(["all", "whatsapp", "web"] as const).map((key) => (
          <Link aria-current={key === channel ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${key === channel ? "border-primary text-primary" : "border-border"}`} href={`${localizedPath(locale, "/admin/inbox")}?channel=${key}`} key={key}>{labels.filters[key]}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="text-muted-foreground">{labels.empty}</p> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th className="p-3">{labels.owner}</th><th className="p-3">{labels.channel}</th><th className="p-3">{labels.last}</th><th className="p-3">{labels.when}</th><th className="p-3">{labels.messages}</th><th className="p-3">{labels.status}</th><th className="p-3"><span className="sr-only">{labels.open}</span></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-border" key={row.id}>
                  <td className="p-3">{row.ownerLabel ?? <span className="text-muted-foreground">{labels.anonymous}</span>}</td>
                  <td className="p-3">{row.channel}</td>
                  <td className="max-w-md truncate p-3">{row.lastMessage ?? ""}</td>
                  <td className="p-3">{row.lastMessageAt ? formatter.format(row.lastMessageAt) : ""}</td>
                  <td className="p-3">{row.messageCount}</td>
                  <td className="p-3">{row.escalated ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{labels.escalated}</span> : row.status}</td>
                  <td className="p-3"><Link className="text-primary underline" href={localizedPath(locale, `/admin/inbox/${row.id}`)}>{labels.open}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
