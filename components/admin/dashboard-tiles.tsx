import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export type DashboardTile = Readonly<{
  id: string;
  href: string;
  label: string;
  /** null when the read failed, so an outage reads as unknown rather than zero. */
  count: number | null;
}>;

export type DashboardTileLabels = Readonly<{
  heading: string;
  description: string;
  view: string;
  unavailable: string;
}>;

/**
 * Queue sizes with a way into each queue. A tile shows `unavailable` rather
 * than `0` when its read failed: "nothing to approve" and "we could not ask"
 * are different answers, and only one of them means staff can stop looking.
 */
export function DashboardTiles({
  locale,
  tiles,
  labels,
}: Readonly<{
  locale: AppLocale;
  tiles: readonly DashboardTile[];
  labels: DashboardTileLabels;
}>) {
  return (
    <section aria-labelledby="admin-dashboard-queues" className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl font-semibold" id="admin-dashboard-queues">
          {labels.heading}
        </h2>
        <p className="text-muted-foreground">{labels.description}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link
              className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href={localizedPath(locale, tile.href)}
            >
              <span className="text-sm font-medium text-muted-foreground">{tile.label}</span>
              <span className="font-serif text-4xl font-semibold tabular-nums">
                {tile.count === null
                  ? <span className="text-lg text-muted-foreground">{labels.unavailable}</span>
                  : tile.count}
              </span>
              <span className="text-sm text-primary">{labels.view}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
