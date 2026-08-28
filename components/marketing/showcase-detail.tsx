import Image from "next/image";
import type {ReactNode} from "react";

import type {AppLocale} from "@/i18n/routing";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import type {PublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{
  premium: string;
  goneGlobal: string;
  memberSince: string;
  useCases: string;
  deployment: string;
  languages: string;
  worksWith: string;
  caseStudy: string;
  video: string;
  requestIntro: string;
}>;

export function ShowcaseDetail({listing, locale, labels, requestIntro}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels; requestIntro?: ReactNode}>) {
  return <article className="mx-auto max-w-4xl space-y-10">
    <header className="space-y-4">
      {listing.logo
        ? <Image alt={listing.logo.alt} className="h-16 w-auto object-contain" height={64} src={listing.logo.url} unoptimized={isPrivateMediaDeliveryUrl(listing.logo.url)} width={160}/>
        : null}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{listing.category}</p>
        {listing.premium ? <span className="rounded-full border border-primary/40 px-2 py-1 text-xs font-medium text-primary">{labels.premium}</span> : null}
        {listing.goneGlobal ? <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">{labels.goneGlobal}</span> : null}
      </div>
      <h1 className="font-serif text-5xl font-semibold tracking-tight">{listing.name}</h1>
      <p className="text-xl text-muted-foreground">{listing.tagline}</p>
      <p className="text-sm text-muted-foreground">{labels.memberSince} {listing.memberSince}</p>
    </header>
    {listing.videoUrl ? <section className="space-y-3"><h2 className="font-serif text-2xl font-semibold">{labels.video}</h2><a className="underline" href={listing.videoUrl} rel="noreferrer" target="_blank">{listing.videoUrl}</a></section> : null}
    <p className="whitespace-pre-line text-lg leading-8 text-muted-foreground">{listing.description}</p>
    <dl className="grid gap-5 sm:grid-cols-2">
      <div><dt className="font-medium">{labels.useCases}</dt><dd className="text-muted-foreground">{listing.useCases.join(", ")}</dd></div>
      <div><dt className="font-medium">{labels.deployment}</dt><dd className="text-muted-foreground">{listing.deploymentOptions.join(", ")}</dd></div>
      <div><dt className="font-medium">{labels.languages}</dt><dd className="text-muted-foreground">{listing.supportedLanguages.join(", ")}</dd></div>
      <div><dt className="font-medium">{labels.worksWith}</dt><dd className="text-muted-foreground">{listing.worksWith.join(", ")}</dd></div>
    </dl>
    {listing.caseStudySummary ? <section className="glass-card space-y-3 p-6"><h2 className="font-serif text-2xl font-semibold">{labels.caseStudy}</h2><p className="text-muted-foreground">{listing.caseStudySummary}</p>{listing.caseStudyUrl ? <a className="underline" href={listing.caseStudyUrl} rel="noreferrer" target="_blank">{listing.caseStudyUrl}</a> : null}</section> : null}
    <section className="glass-card space-y-3 p-6"><h2 className="font-serif text-2xl font-semibold">{labels.requestIntro}</h2>{requestIntro ?? <p className="text-muted-foreground">{localizedPath(locale, "/contact")}</p>}</section>
  </article>;
}
