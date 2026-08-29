"use client";

import {openConcierge} from "@/lib/ai/concierge-open";

export function ContactConciergeLauncher({label}: {label: string}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={openConcierge}
    >
      {label}
    </button>
  );
}
