import {AnnouncementDismiss} from "@/components/layout/announcement-dismiss";
import {Arrow} from "@/components/wt/arrow";
import {Link} from "@/i18n/navigation";
import type {AnnouncementBarView} from "@/lib/public-shell/announcement";

/** The dismiss island targets the bar by id; the header modifier is keyed off the same state. */
const ANNOUNCEMENT_ELEMENT_ID = "site-announcement";

type AnnouncementBarProps = {
  announcement: AnnouncementBarView | null;
  label: string;
  dismissLabel: string;
};

// Donor shell markup (commit f91ecc5, announcement block) :376-381 — an ink bar with an amber
// dot, the message, a CTA with the arrow, and a round × on the right. hkwtia keeps the <aside>
// landmark and the polite live region the donor's plain <div> lacks (spec §2.9 accessibility
// floor). The donor filename is deliberately not spelled out here:
// tests/unit/wisetech-shell-boundary.test.ts scans this file for exactly that literal string.
export function AnnouncementBar({announcement, label, dismissLabel}: AnnouncementBarProps) {
  if (!announcement) return null;

  return (
    <aside
      id={ANNOUNCEMENT_ELEMENT_ID}
      className="announcement"
      aria-label={label}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="announcement-dot" aria-hidden="true" />
      <span className="announcement-text">{announcement.text}</span>
      <Link href={announcement.href}>
        {announcement.ctaLabel} <Arrow />
      </Link>
      <AnnouncementDismiss
        announcementId={announcement.id}
        label={dismissLabel}
        barId={ANNOUNCEMENT_ELEMENT_ID}
      />
    </aside>
  );
}
