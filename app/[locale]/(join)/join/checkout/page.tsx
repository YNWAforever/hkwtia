import {setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
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
