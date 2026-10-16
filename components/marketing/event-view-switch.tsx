"use client";

import {useSearchParams} from "next/navigation";
import {Suspense} from "react";

import {usePathname, useRouter} from "@/i18n/navigation";

export type EventViewMode = "cards" | "calendar";

type EventViewSwitchLabels = Readonly<{label: string; cards: string; calendar: string}>;

// Donor `.event-view-switch` (app/styles/wisetech.css:362-365). Same client-island idiom as
// components/layout/locale-switcher.tsx: useSearchParams needs a Suspense boundary, so the
// interactive read lives in a nested component with a static (non-interactive) fallback.
export function EventViewSwitch({labels}: Readonly<{labels: EventViewSwitchLabels}>) {
  return (
    <Suspense fallback={<EventViewSwitchButtons active="cards" labels={labels} />}>
      <EventViewSwitchContent labels={labels} />
    </Suspense>
  );
}

function EventViewSwitchContent({labels}: Readonly<{labels: EventViewSwitchLabels}>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active: EventViewMode = searchParams.get("view") === "calendar" ? "calendar" : "cards";

  function select(mode: EventViewMode) {
    const next = new URLSearchParams(searchParams.toString());
    if (mode === "cards") next.delete("view");
    else next.set("view", "calendar");
    const query = next.toString();
    // This is an in-page filter toggle over already-visible results, not a real navigation --
    // the default `scroll: true` would jump a scrolled-down user back to the top on every click.
    router.replace(`${pathname}${query ? `?${query}` : ""}`, {scroll: false});
  }

  return <EventViewSwitchButtons active={active} labels={labels} onSelect={select} />;
}

function EventViewSwitchButtons({active, labels, onSelect}: Readonly<{active: EventViewMode; labels: EventViewSwitchLabels; onSelect?: (mode: EventViewMode) => void}>) {
  return (
    <div aria-label={labels.label} className="event-view-switch" role="group">
      <button aria-pressed={active === "cards"} className={active === "cards" ? "active" : undefined} onClick={() => onSelect?.("cards")} type="button">{labels.cards}</button>
      <button aria-pressed={active === "calendar"} className={active === "calendar" ? "active" : undefined} onClick={() => onSelect?.("calendar")} type="button">{labels.calendar}</button>
    </div>
  );
}
