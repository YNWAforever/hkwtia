import Image from "next/image";

import type {PartnerProjection} from "@/lib/db/repos/partners";
import {isPrivateMediaDeliveryUrl} from "@/lib/media/url";

type HomePartnerWallProps = Readonly<{
  partners: readonly PartnerProjection[];
  title: string;
  intro: string;
}>;

export function HomePartnerWall({partners, title, intro}: HomePartnerWallProps) {
  if (!partners.length) return null;

  return (
    <section aria-labelledby="home-partners-heading" className="mx-auto max-w-shell px-4 py-12 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <h2 className="font-serif text-3xl font-semibold" id="home-partners-heading">{title}</h2>
        <p className="mt-3 text-muted-foreground">{intro}</p>
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {partners.map((partner) => {
          const logo = partner.logoUrl && partner.logoAlt ? (
            <Image alt={partner.logoAlt} className="h-16 w-full object-contain" height={64} src={partner.logoUrl} unoptimized={isPrivateMediaDeliveryUrl(partner.logoUrl)} width={192} />
          ) : <span className="font-medium">{partner.name}</span>;
          return <li className="rounded-lg border bg-card p-5" key={partner.id}>
            {partner.websiteUrl ? <a aria-label={partner.name} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={partner.websiteUrl} rel="noopener noreferrer" target="_blank">{logo}</a> : logo}
          </li>;
        })}
      </ul>
    </section>
  );
}
