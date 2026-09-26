import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import Link from "next/link";

import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";
import {getActor} from "@/lib/auth/actor";
import {beginMembershipCheckoutAction} from "@/app/[locale]/(join)/join/actions";
import {membershipPlansRepository} from "@/lib/db/repos/membership-plans";
import {billingAttemptsRepository} from "@/lib/db/repos/billing-attempts";
import {buildPublicMembershipCatalog, publicPriceIds} from "@/lib/membership/public-catalog";
import {localizedPath} from "@/lib/urls";
import {loadPendingJoinBillingState} from "@/lib/membership/join-billing-state";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Mid-flow, member-specific step: keep it out of search results.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/join/checkout",
    title: t("metaTitle"),
    description: t("authDescription"),
    index: false,
  });
}

export default async function CheckoutPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);

  const actor = await getActor().catch(() => null);
  const state = await loadPendingJoinBillingState(actor, queryValue(query.membership_id));
  if (!state) notFound();

  // The fee comes from the same validated catalog as the public pricing page. A
  // missing or inconsistent catalog never produces a made-up amount.
  const tiers = await membershipPlansRepository.list()
    .then((rows) => buildPublicMembershipCatalog({locale, rows, priceIds: publicPriceIds()}))
    .catch(() => []);
  const tier = tiers.find((item) => item.code === state.membership.planCode);
  const attempt = await billingAttemptsRepository.getActive(state.actor, state.membership.id).catch(() => undefined);
  const currentPriceId = state.membership.planCode === "startup"
    ? publicPriceIds().startup
    : state.membership.planCode === "corporate" ? publicPriceIds().corporate : "";
  // A resumable session can retain an older provider price after catalog changes.
  // In that case the provider is the only trustworthy display of the exact amount.
  const annualFee = attempt !== undefined && (!attempt || attempt.priceReference === currentPriceId)
    && tier?.price.kind === "paid"
    ? tier.price.options.find((option) => option.cadence === "annual")?.amount
    : undefined;
  const t = await getTranslations("Join");
  const resume = `${localizedPath(locale, "/join")}?${new URLSearchParams({plan: state.membership.planCode, application: state.application.id})}`;
  const details = `${localizedPath(locale, "/join/company")}?${new URLSearchParams({plan: state.membership.planCode, application: state.application.id})}`;
  return (
    <section className="glass-card p-6 sm:p-10">
      <h1 className="font-serif text-4xl font-semibold">{t("checkoutSummary.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("checkoutSummary.description")}</p>
      <dl className="mt-6 space-y-2">
        <div><dt className="inline font-medium">{t("checkoutSummary.plan")}: </dt><dd className="inline">{t(`plans.${state.membership.planCode}`)}</dd></div>
        <div><dt className="inline font-medium">{t("checkoutSummary.fee")}: </dt><dd className="inline">{annualFee ?? t("checkoutSummary.feeAtProvider")}</dd></div>
        <div><dt className="inline font-medium">{t("checkoutSummary.status")}: </dt><dd className="inline">{t("checkoutSummary.pending")}</dd></div>
      </dl>
      <form action={beginMembershipCheckoutAction} className="mt-8">
        <input name="membershipId" type="hidden" value={state.membership.id}/>
        <input name="locale" type="hidden" value={locale}/>
        <button className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-primary-foreground" type="submit">{t("checkoutSummary.continuePayment")}</button>
      </form>
      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        <Link className="text-primary underline" href={resume}>{t("checkoutSummary.later")}</Link>
        <Link className="text-primary underline" href={details}>{t("checkoutSummary.changeDetails")}</Link>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{t("checkoutSummary.sameAttempt")}</p>
    </section>
  );
}
