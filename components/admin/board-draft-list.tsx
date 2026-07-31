import Link from "next/link";

import type {BoardDraft} from "@/lib/admin/board-drafts";

type Labels = Readonly<{
  heading: string;
  description: string;
  empty: string;
  preview: string;
  reportMonth: string;
  createdAt: string;
  agentRunStatus: string;
  unavailable: string;
  statuses: Readonly<Record<string, string>>;
}>;

export function BoardDraftList({
  drafts,
  labels,
  locale,
}: Readonly<{
  drafts: readonly BoardDraft[];
  labels: Labels;
  locale: string;
}>) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });

  return <section aria-labelledby="board-reporter-drafts" className="space-y-4">
    <header className="max-w-3xl space-y-2">
      <h2 className="font-serif text-2xl font-semibold" id="board-reporter-drafts">{labels.heading}</h2>
      <p className="text-muted-foreground">{labels.description}</p>
    </header>
    {drafts.length === 0 ? <p className="text-muted-foreground">{labels.empty}</p> : <div className="space-y-5">
      {drafts.map((draft) => <article className="space-y-4 rounded-2xl border border-border bg-card p-5" key={draft.id}>
        <header className="space-y-1">
          <h3 className="font-serif text-xl font-semibold">{locale === "zh-HK" ? draft.titleZh : draft.titleEn}</h3>
        </header>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">{labels.reportMonth}</dt><dd className="text-muted-foreground">{draft.reportMonth}</dd></div>
          <div><dt className="font-medium">{labels.createdAt}</dt><dd className="text-muted-foreground">{formatter.format(draft.createdAt)}</dd></div>
          <div><dt className="font-medium">{labels.agentRunStatus}</dt><dd className="text-muted-foreground">{labels.statuses[draft.agentRunStatus] ?? labels.unavailable}</dd></div>
        </dl>
        <Link className="inline-flex rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted" href={`/${locale}/admin/reports/board-drafts/${draft.id}`}>{labels.preview}</Link>
      </article>)}
    </div>}
  </section>;
}
