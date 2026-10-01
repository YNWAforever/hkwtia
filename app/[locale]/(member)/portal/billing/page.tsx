import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {BillingActions} from "@/components/billing/billing-actions";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {createBillingPortalSession, createCheckoutSession} from "@/lib/billing/checkout-service";
import {localizedPath} from "@/lib/urls";
import {policyAcceptanceEnabled} from "@/lib/membership/policy";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {getBillingSummary} from "@/lib/portal/billing-summary";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function queryValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export const dynamic = "force-dynamic";

export default async function BillingPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const query = await searchParams;
  const actor = await requireActor();
  const summary = await getBillingSummary(actor);
  const t = await getTranslations({locale, namespace: "Portal"});
  const errorPath = `${localizedPath(locale, "/portal/billing")}?error=1`;
  const actions: Record<string, () => Promise<void>> = {};

  for (const membership of summary.memberships) {
    if (membership.recovery !== "new_checkout" && membership.recovery !== "resume" && !membership.canViewHistory) continue;
    actions[membership.id] = async () => {
      "use server";
      const currentActor = await requireActor();
      if(membership.recovery==="new_checkout"&&policyAcceptanceEnabled()){
        const current=await membershipsRepository.getBillingAccess(currentActor,membership.id);
        if(current.status!=="pending_payment"||current.stripeSubscriptionId)redirect(errorPath);
        redirect(localizedPath(locale,"/join/checkout")+"?membership_id="+encodeURIComponent(current.id));
      }
      let session: {url: string};
      try {
        session = membership.recovery === "new_checkout"
          ? await createCheckoutSession(currentActor, membership.id, locale)
          : await createBillingPortalSession(currentActor, membership.id, locale);
      } catch {
        redirect(errorPath);
      }
      redirect(session.url);
    };
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("billing.title")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("billing.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("billing.description")}</p>
      </header>
      {queryValue(query.error) === "1" ? <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{t("billing.error")}</p> : null}
      <BillingActions memberships={summary.memberships} supportHref={localizedPath(locale, "/contact")} labels={{manage: t("billing.manage"), recover: t("billing.recover"), history: t("billing.history"), support: t("billing.support"), supportMessage: t("billing.supportMessage"), providerUnavailable: t("billing.providerUnavailable"), empty: t("billing.empty"), plan: (code) => t(`plans.${code}`), status: (value) => t(`status.${value}.label`)}} actions={actions} />
    </div>
  );
}