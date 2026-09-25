import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {EventCompanyPicker} from "@/components/portal/event-company-picker";
import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {saveMemberEventAction} from "@/lib/events/member-actions";
import {loadMemberEventsContext} from "@/lib/events/member-core";
import {isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

import {eventFormLabels} from "../labels";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>; searchParams?: Promise<{companyId?: string}>}>;

export default async function NewMemberEventPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout redirects anonymous visitors too, but Next renders layout and
  // page in parallel, so a page-level requireActor() would throw UNAUTHORIZED
  // into the runtime log on every anonymous hit (audit F21). Redirect here as
  // well; the continuation allowlist (lib/portal/continuation.ts) accepts this
  // deep path, so sign-in returns to it rather than to /portal/events.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent("/portal/events/new")}`);
  const t = await getTranslations({locale, namespace: "Portal.memberEvents"});
  const selectedCompanyId = (await searchParams)?.companyId;
  const context = await loadMemberEventsContext(actor, undefined, selectedCompanyId ? {companyId: selectedCompanyId} : {}).catch((error: unknown) => {
    if (error instanceof Error && error.message === "MEMBERSHIP_INACTIVE") return "NO_MEMBERSHIP_FOR_COMPANY";
    if (error instanceof Error && error.message === "FORBIDDEN") return "NO_MANAGED_COMPANY";
    if (error instanceof Error && (error.message === "NO_MANAGED_COMPANY" || error.message === "NO_MEMBERSHIP_FOR_COMPANY")) return error.message;
    throw error;
  });
  if (typeof context === "string") {
    const message = context === "NO_MANAGED_COMPANY" ? t("noCompany") : t("errors.NO_MEMBERSHIP_FOR_COMPANY");
    return <section className="glass-card space-y-3 p-6"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("newTitle")}</h1><p className="text-muted-foreground">{message}</p></section>;
  }
  const dashboard = await getDashboard(actor);
  const choices = dashboard.companies.filter((company) => company.canManage && dashboard.memberships.some((membership) =>
    membership.companyId === company.id && isBenefitEligibleMembershipStatus(membership.status),
  ));
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("newTitle")}</h1>
        <p className="text-sm font-medium">{t("publishingFor", {company: context.companyName})}</p>
        <p className="text-muted-foreground">{t("quota", {used: context.usedThisQuarter, limit: Number.isFinite(context.limit) ? String(context.limit) : t("unlimited")})}</p>
      </header>
      {choices.length > 1 ? <EventCompanyPicker action={localizedPath(locale, "/portal/events/new")} choices={choices} companyId={context.companyId} labels={{choose: t("chooseCompany"), use: t("useCompany"), changeWarning: t("changeCompanyWarning")}} /> : null}
      <EventForm action={saveMemberEventAction.bind(null, locale, context.companyId)} canSubmit={context.canPublish} canUploadHero={context.limit > 0} labels={eventFormLabels(t)} values={null} />
    </div>
  );
}
