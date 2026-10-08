import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {BillingActions, type BillingDetail} from "@/components/billing/billing-actions";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {createBillingPortalSession, createCheckoutSession} from "@/lib/billing/checkout-service";
import {localizedPath} from "@/lib/urls";
import {policyAcceptanceEnabled} from "@/lib/membership/policy";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {getBillingSummary} from "@/lib/portal/billing-summary";
import {billingPeriodLine} from "@/lib/portal/billing-period";
import {formatPortalDate} from "@/lib/portal/format-date";
import {getDashboard} from "@/lib/portal/queries";

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
  // Renewal and seat details come from the dashboard read; losing them only drops those lines.
  const [summary, dashboard] = await Promise.all([getBillingSummary(actor), getDashboard(actor).catch(() => null)]);
  const details: Record<string, BillingDetail> = {};
  for (const record of dashboard?.memberships ?? []) details[record.id] = {period: billingPeriodLine(record), seatLimit: record.seatLimit || null};
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
      <PortalPageHeader eyebrow={t("navGroups.benefits")} title={t("billing.title")} lead={t("billing.description")}>
        {queryValue(query.error) === "1" ? <p className="portal-form-alert" role="alert">{t("billing.error")}</p> : null}
      </PortalPageHeader>
      <BillingActions
        memberships={summary.memberships}
        supportHref={localizedPath(locale, "/contact")}
        membershipHref={localizedPath(locale, "/membership")}
        details={details}
        labels={{
          manage: t("billing.manage"), manageHelp: t("billing.manageHelp"), recover: t("billing.recover"), history: t("billing.history"),
          support: t("billing.support"), supportMessage: t("billing.supportMessage"), providerUnavailable: t("billing.providerUnavailable"),
          pastDue: t("billing.pastDue"), empty: t("billing.empty"), emptyCopy: t("billing.emptyCopy"), emptyAction: t("billing.emptyAction"),
          plan: (code) => t(`plans.${code}`), status: (value) => t(`status.${value}.label`),
          renewsOn: (date) => t("billing.renewsOn", {date: formatPortalDate(locale, date)}),
          endsOn: (date) => t("billing.endsOn", {date: formatPortalDate(locale, date)}),
          seats: (count) => t("billing.seats", {count}),
        }}
        actions={actions}
      />
    </div>
  );
}
