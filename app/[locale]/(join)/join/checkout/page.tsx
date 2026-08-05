import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";
import {getActor} from "@/lib/auth/actor";
import {createCheckoutSession} from "@/lib/billing/checkout-service";
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
    title: t("title"),
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

  const session = await createCheckoutSession(state.actor, state.membership.id, locale);
  redirect(session.url);
}
