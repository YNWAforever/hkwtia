import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {InboxConversationSummary} from "@/lib/db/repos/inbox";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  owner: string;
  channel: string;
  last: string;
  when: string;
  messages: string;
  status: string;
  handling: string;
  assignee: string;
  unread: string;
  anonymous: string;
  unassigned: string;
  unreadYes: string;
  escalated: string;
  empty: string;
  open: string;
  filters: Readonly<{all: string; whatsapp: string; web: string}>;
  handlingValues: Readonly<{bot: string; human: string; closed: string}>;
  handlingFilters: Readonly<{all: string; human: string; bot: string}>;
}>;

/**
 * `closed` is deliberately not offered as a filter: "all" already includes it,
 * and a fourth pill would suggest closed threads are a working queue when they
 * are the opposite. The URL still accepts `handling=closed` for anyone who wants
 * it, because the repository parses the value rather than trusting this list.
 */
const HANDLING_FILTERS = ["all", "human", "bot"] as const;

/**
 * Both filters are query parameters carried in the href, so the two compose:
 * picking "handled by a person" keeps whichever channel is already selected.
 * `localizedPath` builds the path — `zh-HK` is served at `/zh`, and a hand-built
 * `/${locale}/admin/inbox` 404s on the Chinese admin.
 */
function filterHref(locale: AppLocale, channel: string, handling: string): string {
  return `${localizedPath(locale, "/admin/inbox")}?channel=${channel}&handling=${handling}`;
}

function pill(active: boolean): string {
  return `rounded-full border px-3 py-1 text-sm ${active ? "border-primary text-primary" : "border-border"}`;
}

export function InboxList({locale, rows, labels, channel, handling}: Readonly<{
  locale: AppLocale;
  rows: readonly InboxConversationSummary[];
  labels: Labels;
  channel: "all" | "whatsapp" | "web";
  handling: "all" | "bot" | "human" | "closed";
}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return (
    <div className="space-y-4">
      <nav aria-label={labels.channel} className="flex flex-wrap gap-2">
        {(["all", "whatsapp", "web"] as const).map((key) => (
          <Link aria-current={key === channel ? "page" : undefined} className={pill(key === channel)} href={filterHref(locale, key, handling)} key={key}>{labels.filters[key]}</Link>
        ))}
      </nav>
      <nav aria-label={labels.handling} className="flex flex-wrap gap-2">
        {HANDLING_FILTERS.map((key) => (
          <Link aria-current={key === handling ? "page" : undefined} className={pill(key === handling)} href={filterHref(locale, channel, key)} key={key}>{labels.handlingFilters[key]}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="text-muted-foreground">{labels.empty}</p> : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th className="p-3">{labels.owner}</th><th className="p-3">{labels.channel}</th><th className="p-3">{labels.handling}</th><th className="p-3">{labels.assignee}</th><th className="p-3">{labels.unread}</th><th className="p-3">{labels.last}</th><th className="p-3">{labels.when}</th><th className="p-3">{labels.messages}</th><th className="p-3">{labels.status}</th><th className="p-3"><span className="sr-only">{labels.open}</span></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-border" key={row.id}>
                  <td className="p-3">{row.ownerLabel ?? <span className="text-muted-foreground">{labels.anonymous}</span>}</td>
                  <td className="p-3">{row.channel}</td>
                  <td className="p-3">{labels.handlingValues[row.handling]}</td>
                  <td className="p-3">{row.assigneeLabel ?? <span className="text-muted-foreground">{labels.unassigned}</span>}</td>
                  {/* Text, not a dot: a coloured dot with no label is invisible to a
                      screen reader, and "which threads has nobody looked at" is the
                      question this column exists to answer. */}
                  <td className="p-3">{row.unread ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{labels.unreadYes}</span> : ""}</td>
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
