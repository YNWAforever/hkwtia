import Link from "next/link";
import type { AppLocale } from "@/i18n/routing";
import { localizedPath } from "@/lib/urls";
import type {
  WORK_ACTIONS,
  WORK_KINDS,
  WorkQueueItem,
} from "@/lib/admin/work-queue";
export type WorkQueueLabels = Readonly<{
  title: string;
  description: string;
  mine: string;
  unassigned: string;
  all: string;
  empty: string;
  unavailable: string;
  summary: string;
  owner: string;
  due: string;
  nextAction: string;
  overdue: string;
  assigned: string;
  noDue: string;
  next: string;
  first: string;
  kinds: Readonly<Record<(typeof WORK_KINDS)[number], string>>;
  actions: Readonly<Record<(typeof WORK_ACTIONS)[number], string>>;
  states: Readonly<Record<string, string>>;
}>;
export function WorkQueueTable({
  locale,
  scope,
  page,
  labels,
  cursor,
}: {
  locale: AppLocale;
  scope: "mine" | "unassigned" | "all";
  cursor: string | null;
  page: Readonly<{
    items: readonly WorkQueueItem[];
    nextCursor: string | null;
  }> | null;
  labels: WorkQueueLabels;
}) {
  const href = (selected: string, next: string | null = null) =>
    localizedPath(locale, "/admin") +
    "?" +
    new URLSearchParams({
      workScope: selected,
      ...(next ? { workCursor: next } : {}),
    });
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });
  return (
    <section aria-labelledby="daily-work-heading" className="space-y-4">
      <header className="space-y-1">
        <h2
          id="daily-work-heading"
          className="font-serif text-2xl font-semibold"
        >
          {labels.title}
        </h2>
        <p className="text-muted-foreground">{labels.description}</p>
      </header>
      <nav aria-label={labels.title} className="flex flex-wrap gap-2">
        {(["mine", "unassigned", "all"] as const).map((value) => (
          <Link
            prefetch={false}
            key={value}
            href={href(value)}
            aria-current={scope === value ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {labels[value]}
          </Link>
        ))}
      </nav>
      {page === null ? (
        <p
          role="status"
          className="rounded-md border p-4 text-muted-foreground"
        >
          {labels.unavailable}
        </p>
      ) : page.items.length === 0 ? (
        <p className="rounded-md border p-4 text-muted-foreground">
          {labels.empty}
        </p>
      ) : (
        <ul className="grid gap-3">
          {page.items.map((item) => (
            <li
              key={item.id}
              className="grid min-w-0 gap-3 rounded-md border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {labels.kinds[item.kind]} ·{" "}
                  {labels.states[item.sourceStatus] ?? labels.kinds[item.kind]}
                </p>
                <p className="break-words font-medium">
                  {item.summary || labels.kinds[item.kind]}
                </p>
              </div>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="inline text-muted-foreground">
                    {labels.owner}:{" "}
                  </dt>
                  <dd className="inline">
                    {item.ownerName ??
                      (item.ownerProfileId
                        ? labels.assigned
                        : labels.unassigned)}
                  </dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">
                    {labels.due}:{" "}
                  </dt>
                  <dd className="inline">
                    {item.dueAt ? (
                      <>
                        <time dateTime={item.dueAt}>
                          {format.format(new Date(item.dueAt))}
                        </time>
                        {item.priority === "high" ? (
                          <span className="ml-2 font-semibold text-red-700">
                            {labels.overdue}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      labels.noDue
                    )}
                  </dd>
                </div>
              </dl>
              <Link
                prefetch={false}
                className="inline-flex min-h-11 items-center self-center justify-self-start rounded-md border px-3 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
                href={localizedPath(locale, item.href)}
              >
                {labels.actions[item.nextActionCode]}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor || cursor ? (
        <nav aria-label={labels.nextAction} className="flex flex-wrap gap-3">
          {cursor ? (
            <Link
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-md border px-4"
              href={href(scope)}
            >
              {labels.first}
            </Link>
          ) : null}
          {page?.nextCursor ? (
            <Link
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-md border px-4"
              href={href(scope, page.nextCursor)}
            >
              {labels.next}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
