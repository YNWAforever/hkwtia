import type {FundingLocale} from "@/config/funding-schemes";
import type {PublicLandingPartner} from "@/lib/launchpad/contracts";

export type LandingPartnerMapLabels = Readonly<{
  title: string;
  empty: string;
  market: string;
  region: string;
  statuses: Readonly<Record<PublicLandingPartner["mouStatus"], string>>;
}>;

export function LandingPartnerMap({
  partners,
  locale,
  labels,
}: Readonly<{
  partners: readonly PublicLandingPartner[];
  locale: FundingLocale;
  labels: LandingPartnerMapLabels;
}>) {
  if (!partners.length) return <p className="text-muted-foreground">{labels.empty}</p>;
  return <ul aria-label={labels.title} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {partners.map((partner) => <li className="rounded-lg border p-5" key={partner.id}>
      <p className="text-sm text-muted-foreground">{partner.region}</p>
      <h3 className="mt-1 text-lg font-semibold">{locale === "zh-HK" ? partner.organizationZhHk : partner.organizationEn}</h3>
      <dl className="mt-4 space-y-2 text-sm"><div><dt className="font-medium">{labels.market}</dt><dd>{partner.market}</dd></div><div><dt className="font-medium">{labels.region}</dt><dd>{partner.region}</dd></div><div><dt className="font-medium">{labels.statuses[partner.mouStatus]}</dt></div></dl>
    </li>)}
  </ul>;
}
