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

  // The bar is a server-rendered sibling, so the island writes to it directly rather than
  // lifting its markup across the client boundary. React never re-renders that node, so
  // nothing competes for the attribute below.
  //
  // The dismissal itself is stamped on <html>, not on header.site-header: HeaderShell (Task 3)
  // is a client component that recomputes the header's className from its own React state
  // (data-variant, .scrolled) on every render, so a class added here by direct DOM mutation
  // would be silently dropped the next time the reader scrolls and HeaderShell re-renders.
  // <html> belongs to the root layout, entirely outside HeaderShell's tree, so React never
  // recomputes its attributes and nothing here competes with it. Task 3's own server-rendered
  // "no-announcement" modifier is untouched and still covers the other case -- no announcement
  // published at all; this attribute covers only "an announcement exists but was dismissed".
  useEffect(() => {
    const bar = document.getElementById(barId);
    if (bar) {
      bar.setAttribute("data-dismissed", String(dismissed));
      if (dismissed) bar.setAttribute("aria-hidden", "true");
      else bar.removeAttribute("aria-hidden");
    }
    if (dismissed) document.documentElement.dataset.announcementDismissed = "true";
    else delete document.documentElement.dataset.announcementDismissed;
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
