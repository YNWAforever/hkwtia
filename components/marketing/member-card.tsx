import Image from "next/image";
import Link from "next/link";

import {industryTagLabel} from "@/config/industry-tags";
import type {AppLocale} from "@/i18n/routing";
import type {PublicMemberSummary} from "@/lib/db/repos/company-profiles";
import {isPrivateMediaDeliveryUrl, mediaDeliverySrc} from "@/lib/media/url";
import {DirectoryPersonSlots} from "@/components/marketing/directory-person-slots";
import {directoryCardModel} from "@/lib/members/profile-hooks";
import {localeText} from "@/lib/members/public";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {localizedPath} from "@/lib/urls";

type Labels = Readonly<{plans: Readonly<Record<MembershipPlanCode, string>>; view: string}>;

/** Three is what the donor card's badge row holds before it wraps into the title. */
const MAX_TAGS = 3;

export function MemberCard({member, locale, labels}: Readonly<{member: PublicMemberSummary; locale: AppLocale; labels: Labels}>) {
  const model = directoryCardModel(member);
  const tagline = localeText(model.tagline, locale);
  return <article className="partner-record-card">
    {/* The donor's record card always carries the logo plate; a member without a logo gets the
        plate with their own initial rather than a broken frame or a stock mark that would imply
        a brand we were never given. `unoptimized` for a private delivery url: the optimizer
        cannot fetch a signed, short-lived asset, exactly as ShowcaseCard does. */}
    <div className="partner-record-logo">
      {model.logoUrl
        ? <Image alt={model.name} height={202} src={mediaDeliverySrc(model.logoUrl, 640)} unoptimized={isPrivateMediaDeliveryUrl(model.logoUrl)} width={320} />
        : <span aria-hidden="true">{model.name.slice(0, 1)}</span>}
    </div>
    <div className="partner-record-body">
      <div className="flex flex-wrap gap-2">
        {model.plan ? <span className="partner-status">{labels.plans[model.plan]}</span> : null}
        {model.tags.slice(0, MAX_TAGS).map((tag) => (
          <span className="partner-status" key={tag}>{industryTagLabel(tag, locale)}</span>
        ))}
      </div>
      <h3>{model.name}</h3>
      {tagline ? <p>{tagline}</p> : null}
      <DirectoryPersonSlots people={model.people}/>
    </div>
    <Link className="text-link" href={localizedPath(locale, `/members/${model.slug}`)}>{labels.view}</Link>
  </article>;
}
