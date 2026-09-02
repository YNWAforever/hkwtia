import Image from "next/image";

import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

type DualBrandLockupProps = {
  labels: {
    homeLabel: string;
    publicName: string;
    /** D-10: the association's own description of itself, including the zh legal-name note. */
    descriptor: string;
    logoAlt: string;
  };
  priority?: boolean;
  className?: string;
};

// Donor commit f91ecc5 :208-220 — a white 108x48 logo tile beside the wordmark and the
// descriptor. The Tailwind utilities on the anchor are hkwtia's own 44px tap-target floor
// (spec §2.9); the donor's .brand carries no minimum. No `min-w-0` here: `.brand` already
// sets min-width: 0 (app/styles/wisetech.css:55), and passing both to `cn` would let
// tailwind-merge drop `min-w-11` and fail the lockup's own 44px assertion. The PNG is
// byte-pinned by tests/unit/wisetech-asset-provenance.test.ts — restyle the tile, never the file.
export function DualBrandLockup({labels, priority = false, className}: DualBrandLockupProps) {
  return (
    <Link
      className={cn("brand min-h-11 min-w-11 max-w-full", className)}
      href="/"
      aria-label={labels.homeLabel}
    >
      <span className="brand-logo-wrap">
        <Image
          src="/images/wtia-logo.png"
          alt={labels.logoAlt}
          width={2001}
          height={721}
          priority={priority}
          className="h-full w-full object-contain"
        />
      </span>
      <span className="brand-copy">
        <strong>{labels.publicName}</strong>
        <small>{labels.descriptor}</small>
      </span>
    </Link>
  );
}
