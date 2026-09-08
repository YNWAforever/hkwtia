import type {AppLocale} from "@/i18n/routing";
import type {InboxTranscript} from "@/lib/db/repos/inbox";

type Labels = Readonly<{roles: Readonly<{user: string; assistant: string; tool: string}>}>;

export function InboxThread({locale, transcript, labels}: Readonly<{locale: AppLocale; transcript: InboxTranscript; labels: Labels}>) {
  const formatter = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"});
  return (
    <ol className="space-y-3">
      {transcript.messages.map((message) => (
        <li className={`rounded-md border border-border p-4 ${message.role === "user" ? "bg-background" : "bg-muted/40"}`} key={message.id}>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{labels.roles[message.role]} · {message.channel} · <time dateTime={message.createdAt.toISOString()}>{formatter.format(message.createdAt)}</time></p>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </li>
      ))}
    </ol>
  );
}
