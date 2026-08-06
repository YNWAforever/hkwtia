import Image from "next/image";
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import type {PublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{premium: string; goneGlobal: string; memberSince: string; view: string}>;

export function ShowcaseCard({listing, locale, labels}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels}>) {
  return <article className="glass-card flex h-full flex-col gap-4 p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3">{listing.logo ? <Image alt={listing.logo.alt} className="mt-1 h-10 w-10 shrink-0 rounded object-contain" height={40} src={listing.logo.url} width={40}/> : null}<div><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{listing.category}</p><h2 className="mt-2 font-serif text-2xl font-semibold">{listing.name}</h2></div></div><div className="flex flex-wrap justify-end gap-2">{listing.premium ? <span className="rounded-full border border-primary/40 px-2 py-1 text-xs font-medium text-primary">{labels.premium}</span> : null}{listing.goneGlobal ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{labels.goneGlobal}</span> : null}</div></div><p className="text-sm font-medium text-muted-foreground">{listing.tagline}</p><p className="line-clamp-3 text-sm text-muted-foreground">{listing.description}</p><p className="mt-auto text-xs text-muted-foreground">{labels.memberSince} {listing.memberSince}</p><Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium" href={localizedPath(locale, `/showcase/${listing.slug}`)}>{labels.view}</Link></article>;
}
