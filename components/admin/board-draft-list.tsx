import {SafeGeneratedContent} from "@/components/admin/safe-generated-content";
import type {BoardDraft} from "@/lib/admin/board-drafts";

type Labels = Readonly<{
  heading: string;
  description: string;
  empty: string;
  preview: string;
  slug: string;
  createdAt: string;
  sourceKey: string;
  agentRunId: string;
  unavailable: string;
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{labels.preview}</p>
          <h3 className="font-serif text-xl font-semibold">{locale === "zh-HK" ? draft.titleZh : draft.titleEn}</h3>
        </header>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">{labels.slug}</dt><dd className="break-all text-muted-foreground">{draft.slug}</dd></div>
          <div><dt className="font-medium">{labels.createdAt}</dt><dd className="text-muted-foreground">{formatter.format(draft.createdAt)}</dd></div>
          <div><dt className="font-medium">{labels.sourceKey}</dt><dd className="break-all text-muted-foreground">{draft.sourceKey ?? labels.unavailable}</dd></div>
          <div><dt className="font-medium">{labels.agentRunId}</dt><dd className="break-all text-muted-foreground">{draft.agentRunId ?? labels.unavailable}</dd></div>
        </dl>
        <SafeGeneratedContent content={draft.bodyMdx}/>
      </article>)}
    </div>}
  </section>;
}
