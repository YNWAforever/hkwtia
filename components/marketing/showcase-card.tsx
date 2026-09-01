import Image from "next/image";
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import type {PublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{premium: string; goneGlobal: string; memberSince: string; view: string}>;

export function ShowcaseCard({listing, locale, labels}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels}>) {
  return <article className="glass-card flex h-full flex-col overflow-hidden transition-shadow hover:shadow-lg">
    <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {listing.logo ? <Image alt={listing.logo.alt} className="h-14 w-14 shrink-0 rounded-lg border border-border/60 bg-background object-contain p-1" height={56} src={listing.logo.url} unoptimized={isPrivateMediaDeliveryUrl(listing.logo.url)} width={56}/> : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{listing.category}</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold leading-tight">{listing.name}</h2>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {listing.premium ? <span className="rounded-full border border-primary/40 px-2 py-1 text-xs font-medium text-primary">{labels.premium}</span> : null}
          {listing.goneGlobal ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{labels.goneGlobal}</span> : null}
        </div>
      </div>
      <p className="text-sm font-semibold text-foreground/80">{listing.tagline}</p>
      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{listing.description}</p>
      <p className="mt-auto text-xs text-muted-foreground">{labels.memberSince} {listing.memberSince}</p>
    </div>
    <Link className="inline-flex min-h-11 items-center justify-center border-t border-border/60 bg-muted/40 px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" href={localizedPath(locale, `/showcase/${listing.slug}`)}>{labels.view}</Link>
  </article>;
}
