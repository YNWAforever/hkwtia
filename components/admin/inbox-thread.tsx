import type {AppLocale} from "@/i18n/routing";
import type {InboxMessage, InboxTranscript} from "@/lib/db/repos/inbox";

/**
 * The staff-facing transcript. A Server Component, and it stays one: the repo
 * treats its ~40 `'use client'` files as a budget, and the only thing on this
 * page that needs the browser is the composer.
 *
 * `roles` is keyed by `InboxMessage["role"]`, which gained `staff` when 0031
 * added it to `message_role`. Without the fourth key a staff reply renders under
 * "Sender" / 「發送者」 — attributed to the prospect who wrote in.
 *
 * `delivery` is keyed by `messages.delivery_status`, which is NULL for every
 * inbound row and every web row. NULL means "not in the delivery ledger", not
 * "unknown", so nothing at all is drawn for those — a tick of any kind would be
 * an invention.
 */
type Labels = Readonly<{
  roles: Readonly<{user: string; assistant: string; tool: string; staff: string}>;
  delivery: Readonly<{queued: string; sent: string; delivered: string; read: string; failed: string}>;
}>;

/**
 * Alignment is by `direction`, never by role. A `role='tool'` row is outbound
 * and a `role='user'` row is inbound, but what a reader needs from the shape of
 * the thread is which way the message travelled — and 0031 gave `messages` a
 * column that says so rather than a role to infer it from.
 */
function rowClassName(message: InboxMessage): string {
  return message.direction === "outbound"
    ? "ml-auto max-w-[42rem] rounded-md border border-border bg-muted/40 p-4"
    : "mr-auto max-w-[42rem] rounded-md border border-border bg-background p-4";
}

function DeliveryIndicator({labels, message}: Readonly<{labels: Labels; message: InboxMessage}>) {
  if (message.deliveryStatus === null) return null;
  const text = labels.delivery[message.deliveryStatus];
  // Text, not a tick glyph: a ✓✓ alone is unreadable to a screen reader and
  // ambiguous to everyone else. A failure carries the provider's own code, which
  // is the one string that tells staff whether to retry or to escalate — and
  // `queueStaffMessage` reads that same column to decide whether the reply may
  // be re-taken at all, so showing it is showing the state the retry depends on.
  return message.deliveryStatus === "failed"
    ? <span className="text-destructive">{text}{message.errorCode === null ? null : ` · ${message.errorCode}`}</span>
    : <span>{text}</span>;
}

export function InboxThread({locale, transcript, labels}: Readonly<{locale: AppLocale; transcript: InboxTranscript; labels: Labels}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return (
    <ol className="space-y-3">
      {transcript.messages.map((message) => (
        <li className={rowClassName(message)} key={message.id}>
          <p className="mb-1 flex flex-wrap gap-x-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span>{labels.roles[message.role]}</span>
            <span aria-hidden="true">·</span>
            <span>{message.channel}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={message.createdAt.toISOString()}>{formatter.format(message.createdAt)}</time>
            {message.deliveryStatus === null ? null : <span aria-hidden="true">·</span>}
            <DeliveryIndicator labels={labels} message={message} />
          </p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </li>
      ))}
    </ol>
  );
}
