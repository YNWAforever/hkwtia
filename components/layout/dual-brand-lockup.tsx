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
// descriptor. `min-h-11` is hkwtia's own 44px tap-target floor (spec §2.9), which the donor's
// .brand does not carry. The *width* floor is the 108px logo tile, not `min-w-11`: the port's
// `.brand { min-width: 0 }` (app/styles/wisetech.css:55) lands after the Tailwind layers and
// overrides it at runtime. The utility stays because it is the anchor's only width floor if the
// tile is ever dropped, and because no `min-w-0` is passed alongside it — tailwind-merge would
// resolve that conflict by discarding `min-w-11` from the class string entirely. The PNG is
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
