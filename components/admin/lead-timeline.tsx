import type {ContactActivity, ContactActivityKind} from "@/lib/db/repos/contact-activities";

export type LeadTimelineLabels = Readonly<{
  empty: string;
  system: string;
  by: (name: string) => string;
  kinds: Readonly<Record<Exclude<ContactActivityKind, "stage_change">, string>>;
  stageChange: (from: string, to: string) => string;
}>;

/**
 * Phase E. The contact's history, in the order the repository returns it
 * (newest first; this component never re-sorts, so the order has one owner).
 * The activity `kind` is a closed enum, so every label is a bundle key — no
 * stored English reaches the page except the note text a person typed.
 */
export function LeadTimeline({
  activities,
  labels,
  stageLabel,
  formatter,
}: Readonly<{
  activities: readonly ContactActivity[];
  labels: LeadTimelineLabels;
  stageLabel: (code: string) => string;
  formatter: Intl.DateTimeFormat;
}>) {
  if (activities.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <ol className="space-y-4" data-timeline>
      {activities.map((entry) => {
        const heading = entry.kind === "stage_change"
          ? labels.stageChange(stageLabel(String(entry.meta.from ?? "")), stageLabel(String(entry.meta.to ?? "")))
          : labels.kinds[entry.kind];
        return (
          <li className="border-l-2 border-border pl-4" key={entry.id}>
            <p className="text-sm font-medium">{heading}</p>
            {entry.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{entry.body}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {formatter.format(entry.createdAt)} · {labels.by(entry.actorName ?? labels.system)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
