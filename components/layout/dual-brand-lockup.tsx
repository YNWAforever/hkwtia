import Image from "next/image";

import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

export type DualBrandLockupLabels = {
  homeLabel: string;
  publicName: string;
  /** The association name shown under the wordmark. */
  descriptor: string;
  logoAlt: string;
};

type DualBrandLockupProps = {
  labels: DualBrandLockupLabels;
  priority?: boolean;
  className?: string;
  /**
   * Light header: full-colour black-text lockup.
   * Navy footer: mono-white lockup. Full-colour on #6686BD is forbidden (C2);
   * the link-heavy footer uses navy #0F4C81 instead, which still takes mono-white.
   */
  surface?: "light" | "navy";
};

// Donor commit f91ecc5 :208-220 — a white 108x48 logo tile beside the wordmark and the
// descriptor. `min-h-11` is hkwtia's own 44px tap-target floor (spec §2.9), which the donor's
// .brand does not carry. The *width* floor is the 108px logo tile, not `min-w-11`: the port's
// `.brand { min-width: 0 }` (app/styles/wisetech.css:55) lands after the Tailwind layers and
// overrides it at runtime. The utility stays because it is the anchor's only width floor if the
// tile is ever dropped, and because no `min-w-0` is passed alongside it — tailwind-merge would
// resolve that conflict by discarding `min-w-11` from the class string entirely. The light
// lockup PNG is byte-pinned by tests/unit/wisetech-asset-provenance.test.ts — restyle the
// tile, never that file. The navy footer uses the mono-white SVG (transparent swoosh
// cut-outs). Next is not allowed to rasterise SVG, so that surface skips the optimizer.
const LOGO = {
  light: {src: "/images/wtia-logo.png", width: 2001, height: 721},
  navy: {src: "/images/wtia-logo-mono-white.svg", width: 780, height: 251},
} as const;

export function DualBrandLockup({labels, priority = false, className, surface = "light"}: DualBrandLockupProps) {
  const logo = LOGO[surface];
  return (
    <Link
      className={cn("brand min-h-11 min-w-11 max-w-full", className)}
      href="/"
      prefetch={false}
    >
      <span className={cn("brand-logo-wrap", surface === "navy" ? "brand-logo-navy" : "brand-logo-light")}>
        <Image
          src={logo.src}
          alt={labels.logoAlt}
          width={logo.width}
          height={logo.height}
          sizes="(max-width: 820px) 96px, 135px"
          preload={priority}
          unoptimized={surface === "navy"}
          className="h-auto w-full object-contain"
        />
      </span>
      <span className="brand-copy">
        <strong>{labels.publicName}</strong>
        <small>{labels.descriptor}</small>
      </span>
      {/* After the visible wordmark so the accessible name contains it (WCAG 2.5.3).
          An aria-label of only "WTIA home" dropped the descriptor. */}
      <span className="sr-only">{labels.homeLabel}</span>
    </Link>
  );
}
