import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {headers} from "next/headers";

import type {AppLocale} from "@/i18n/routing";
import {membershipPlansRepository} from "@/lib/db/repos/membership-plans";
import {joinInvitesRepository, type OpenedInvite} from "@/lib/db/repos/join-invites";
import {inviteOpenAllowed} from "@/lib/membership/join-invite-cookie";
import {isWellFormedInviteToken} from "@/lib/membership/join-invite-token";
import {buildPublicMembershipCatalog, publicPriceIds} from "@/lib/membership/public-catalog";
import {localizedPath} from "@/lib/urls";

type Props = {params: Promise<{locale: string; token: string}>};

// A personal link is a capability, not a page to index or share: it is noindex whatever the token is,
// and the metadata deliberately never touches the invite (that would stamp `opened_at` twice).
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return {title: t("invite.metaTitle"), robots: {index: false, follow: false}};
}

/**
 * The invite, or null for every reason it cannot be shown. Reasons are never distinguished. This is
 * `peek`, not `open`: unfurlers and mail scanners fetch this page, so viewing must not stamp. The
 * continue route is the only caller of `open`.
 */
async function openInvite(token: string): Promise<OpenedInvite | null> {
  if (!isWellFormedInviteToken(token)) return null;
  if (!inviteOpenAllowed(await headers())) return null;
  return joinInvitesRepository.peek(token).catch(() => null);
}

export default async function JoinInvitePage({params}: Props) {
  const {locale: localeValue, token} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [t, tMembership, invite] = await Promise.all([
    getTranslations({locale, namespace: "Join"}),
    getTranslations({locale, namespace: "Membership"}),
    openInvite(token),
  ]);

  if (!invite) {
    // Unknown, expired, consumed, superseded, malformed and rate-limited all land here, byte-identical,
    // so the page cannot be used to learn which links exist.
    return (
      <section aria-labelledby="join-invite-title" className="space-y-4">
        <h1 className="text-3xl font-semibold text-primary" id="join-invite-title">{t("invite.invalid.title")}</h1>
        <p className="text-muted-foreground">{t("invite.invalid.body")}</p>
        <p className="flex flex-wrap gap-x-6">
          <a className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={localizedPath(locale, "/join")}>{t("invite.invalid.action")}</a>
          <a className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={localizedPath(locale, "/contact")}>{t("invite.invalid.contact")}</a>
        </p>
      </section>
    );
  }

  const rows = await membershipPlansRepository.list().catch(() => null);
  const tier = rows === null
    ? undefined
    : buildPublicMembershipCatalog({locale, rows, priceIds: publicPriceIds()}).find((candidate) => candidate.code === invite.planCode);
  const planName = tMembership(`tiers.${invite.planCode}.name`);
  const fees = tier?.price.kind === "paid"
    ? tier.price.options.map((option) => `${option.amount} ${tMembership(`cadenceLabels.${option.cadence}`)}`)
    : tier?.price.kind === "free" ? [t("invite.free")] : [];
  const benefits = tMembership.raw(`tierBenefits.${invite.planCode}`) as string[];
  const expires = new Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"}).format(invite.expiresAt);

  return (
    <section aria-labelledby="join-invite-title" className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-primary" id="join-invite-title">
          {invite.contactDisplayName ? t("invite.welcomeNamed", {name: invite.contactDisplayName}) : t("invite.welcome")}
        </h1>
        <p className="text-muted-foreground">
          {invite.inviterFirstName ? t("invite.invitedBy", {inviter: invite.inviterFirstName, plan: planName}) : t("invite.invited", {plan: planName})}
        </p>
      </div>
      <dl className="rounded-lg border border-border bg-white p-5">
        <dt className="text-sm text-muted-foreground">{t("invite.planLabel")}</dt>
        <dd className="text-xl font-semibold">{planName}</dd>
        {fees.length > 0 ? (
          <>
            <dt className="mt-3 text-sm text-muted-foreground">{t("invite.feeLabel")}</dt>
            {fees.map((fee) => <dd className="font-medium" key={fee}>{fee}</dd>)}
          </>
        ) : null}
      </dl>
      {benefits.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold">{t("invite.benefitsLabel")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
        </div>
      ) : null}
      {/* A plain anchor to the handler, not a next/link: a prefetch of it would open the invite and set the cookie. */}
      <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground" href={localizedPath(locale, `/join/invite/${token}/continue`)}>{t("invite.continue")}</a>
      <p className="text-sm text-muted-foreground">{t("invite.expires", {date: expires})}</p>
    </section>
  );
}
