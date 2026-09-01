"use client";

import {X} from "lucide-react";
import {useState} from "react";

import {Link} from "@/i18n/navigation";
import type {AnnouncementBarView} from "@/lib/public-shell/announcement";

type AnnouncementBarProps = {
  announcement: AnnouncementBarView | null;
  label: string;
  dismissLabel: string;
};

export function AnnouncementBar({announcement, label, dismissLabel}: AnnouncementBarProps) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  if (!announcement || dismissedId === announcement.id) return null;

  return (
    <aside className="bg-shell-navy text-white" aria-label={label} aria-live="polite" aria-atomic="true">
      <div className="mx-auto flex min-h-11 max-w-shell items-center justify-center gap-3 px-4 py-2 text-center text-sm">
        <Link className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 break-all font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" href={announcement.href}>
          <span>{announcement.text}</span><span>{announcement.ctaLabel}</span>
        </Link>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={dismissLabel}
          onClick={() => setDismissedId(announcement.id)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
