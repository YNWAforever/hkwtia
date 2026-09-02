"use client";

import {useEffect, useState} from "react";

/**
 * One key, not one per id: the donor dismisses "the announcement", and the repository only
 * ever serves one at a time (announcementsRepository.getActive). Storing the id lets a newly
 * published announcement reappear without the reader having to clear anything.
 */
const DISMISSED_KEY = "hkwtia:announcement-dismissed";

/** Private browsing and blocked site data make sessionStorage throw, not return null. */
function readDismissedId(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissedId(id: string) {
  try {
    window.sessionStorage.setItem(DISMISSED_KEY, id);
  } catch {
    // A reader who cannot persist the dismissal still gets it for this page view.
  }
}

type AnnouncementDismissProps = {
  announcementId: string;
  label: string;
  /** id of the server-rendered `.announcement` element this button lives inside. */
  barId: string;
};

export function AnnouncementDismiss({announcementId, label, barId}: AnnouncementDismissProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the browser-only sessionStorage API after mount; reading it during render instead would mismatch the server-rendered markup, which never has a session.
    if (readDismissedId() === announcementId) setDismissed(true);
  }, [announcementId]);

  // The bar and the header are server-rendered siblings, so the island writes to them
  // directly rather than lifting their markup across the client boundary. React never
  // re-renders those nodes, so nothing competes for these attributes.
  useEffect(() => {
    const bar = document.getElementById(barId);
    const header = document.querySelector<HTMLElement>("header.site-header");
    if (bar) {
      bar.setAttribute("data-dismissed", String(dismissed));
      if (dismissed) bar.setAttribute("aria-hidden", "true");
      else bar.removeAttribute("aria-hidden");
    }
    header?.classList.toggle("no-announcement", dismissed);
  }, [barId, dismissed]);

  if (dismissed) return null;

  return (
    <button
      type="button"
      className="announcement-close"
      aria-label={label}
      onClick={() => {
        writeDismissedId(announcementId);
        setDismissed(true);
      }}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
