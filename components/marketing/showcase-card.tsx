import Image from "next/image";
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";
import type {PublicListing} from "@/lib/showcase/contracts";
import {localizedPath} from "@/lib/urls";

// `category` is optional so the existing pinned test in tests/unit/m5-public-showcase.test.tsx,
// which supplies labels without it, keeps typechecking; the dt/dd row is simply omitted then.
type Labels = Readonly<{premium: string; goneGlobal: string; memberSince: string; category?: string; view: string}>;

export function ShowcaseCard({listing, locale, labels}: Readonly<{listing: PublicListing; locale: AppLocale; labels: Labels}>) {
  return <article className="partner-record-card">
    {listing.logo ? (
      <div className="partner-record-logo">
        <Image alt={listing.logo.alt} height={202} src={listing.logo.url} unoptimized={isPrivateMediaDeliveryUrl(listing.logo.url)} width={320} />
      </div>
    ) : null}
    <div className="partner-record-body">
      <div className="flex flex-wrap gap-2">
        {listing.premium ? <span className="partner-status">{labels.premium}</span> : null}
        {listing.goneGlobal ? <span className="partner-status">{labels.goneGlobal}</span> : null}
      </div>
      <h3>{listing.name}</h3>
      <p>{listing.tagline}</p>
      <dl>
        {labels.category ? <div><dt>{labels.category}</dt><dd>{listing.category}</dd></div> : null}
        <div><dt>{labels.memberSince}</dt><dd>{listing.memberSince}</dd></div>
      </dl>
    </div>
    <Link className="text-link" href={localizedPath(locale, `/showcase/${listing.slug}`)}>{labels.view}</Link>
  </article>;
}
