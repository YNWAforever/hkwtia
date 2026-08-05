import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {CheckoutStatus} from "@/components/billing/checkout-status";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";
import {getActor} from "@/lib/auth/actor";
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
    pathname: "/join/complete",
    title: t("title"),
    description: t("authDescription"),
    index: false,
  });
}

export default async function CompletePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);

  const actor = await getActor().catch(() => null);
  const state = await loadPendingJoinBillingState(actor, queryValue(query.membership_id));
  if (!state) notFound();

  const t = await getTranslations("Join");
  return (
    <section className="glass-card p-6 sm:p-10">
      <h1 className="font-serif text-4xl font-semibold">{t("status.checkout.title")}</h1>
      <div className="mt-4 text-muted-foreground">
        <CheckoutStatus
          labels={{processing: t("status.checkout.description"), active: t("status.checkout.description"), failed: t("errors.save")}}
          status="processing"
        />
      </div>
    </section>
  );
}
