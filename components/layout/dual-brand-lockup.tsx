import Image from "next/image";

import {Link} from "@/i18n/navigation";
import {cn} from "@/lib/utils";

export type DualBrandLabels = Readonly<{
  homeLabel: string;
  publicName: string;
  operator: string;
  logoAlt: string;
}>;

type DualBrandLockupProps = {
  labels: DualBrandLabels;
  priority?: boolean;
  compact?: boolean;
};

export function DualBrandLockup({labels, priority = false, compact = false}: DualBrandLockupProps) {
  return (
    <Link className="group inline-flex min-h-11 min-w-11 max-w-full min-w-0 items-center gap-3" href="/" aria-label={labels.homeLabel}>
      <Image
        src="/images/wtia-logo.png"
        alt={labels.logoAlt}
        width={2001}
        height={721}
        priority={priority}
        className={cn("w-auto shrink-0 object-contain", compact ? "h-8" : "h-10")}
      />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold tracking-tight text-current sm:text-base">
          {labels.publicName}
        </span>
        <span className="block truncate text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-shell-muted group-hover:text-current">
          {labels.operator}
        </span>
      </span>
    </Link>
  );
}
