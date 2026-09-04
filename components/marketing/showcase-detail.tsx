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
  overview?: string;
  capabilities?: string;
  useCases: string;
  deployment: string;
  languages: string;
  worksWith: string;
  caseStudy: string;
  video: string;
  requestIntro: string;
}>;

export function ShowcaseDetail({listing, locale, labels, requestIntro}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels; requestIntro?: ReactNode}>) {
  return <div className="detail-page">
    <div className="detail-main">
      <header>
        {listing.logo
          ? <Image alt={listing.logo.alt} className="h-16 w-auto rounded-lg object-contain" height={64} src={listing.logo.url} unoptimized={isPrivateMediaDeliveryUrl(listing.logo.url)} width={160} />
          : null}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{listing.category}</p>
          {listing.premium ? <span className="partner-status">{labels.premium}</span> : null}
          {listing.goneGlobal ? <span className="partner-status">{labels.goneGlobal}</span> : null}
        </div>
        <h1>{listing.name}</h1>
        <p className="lead">{listing.tagline}</p>
        <p>{labels.memberSince} {listing.memberSince}</p>
      </header>
      {listing.videoUrl ? <section><h2>{labels.video}</h2><a href={listing.videoUrl} rel="noreferrer" target="_blank">{listing.videoUrl}</a></section> : null}
      <section>
        {labels.overview ? <h2>{labels.overview}</h2> : null}
        <p className="whitespace-pre-line">{listing.description}</p>
      </section>
      <section>
        {labels.capabilities ? <h2>{labels.capabilities}</h2> : null}
        <dl className="practical-grid">
          <div><dt>{labels.useCases}</dt><dd>{listing.useCases.join(", ")}</dd></div>
          <div><dt>{labels.deployment}</dt><dd>{listing.deploymentOptions.join(", ")}</dd></div>
          <div><dt>{labels.languages}</dt><dd>{listing.supportedLanguages.join(", ")}</dd></div>
          <div><dt>{labels.worksWith}</dt><dd>{listing.worksWith.join(", ")}</dd></div>
        </dl>
      </section>
      {listing.caseStudySummary ? <section><h2>{labels.caseStudy}</h2><p>{listing.caseStudySummary}</p>{listing.caseStudyUrl ? <a href={listing.caseStudyUrl} rel="noreferrer" target="_blank">{listing.caseStudyUrl}</a> : null}</section> : null}
    </div>
    <aside className="detail-aside">
      <h3>{labels.requestIntro}</h3>
      {requestIntro ?? <p>{localizedPath(locale, "/contact")}</p>}
    </aside>
  </div>;
}
