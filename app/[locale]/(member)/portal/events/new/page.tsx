import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {PrivateLink} from "@/components/internal-shell/private-link";
import {EventCompanyPicker} from "@/components/portal/event-company-picker";
import {EventForm} from "@/components/portal/event-form";
import {PortalPageHeader} from "@/components/portal/page-header";
import {HonestEmpty} from "@/components/wt/honest-empty";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {saveMemberEventAction} from "@/lib/events/member-actions";
import {loadMemberEventsContext} from "@/lib/events/member-core";
import {isBenefitEligibleMembershipStatus} from "@/lib/membership/entitlements";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

import {eventFormLabels, submitBlockedReason} from "../labels";

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
  const tForms = await getTranslations({locale, namespace: "Portal.forms"});
  const selectedCompanyId = (await searchParams)?.companyId;
  const context = await loadMemberEventsContext(actor, undefined, selectedCompanyId ? {companyId: selectedCompanyId} : {}).catch((error: unknown) => {
    if (error instanceof Error && error.message === "MEMBERSHIP_INACTIVE") return "NO_MEMBERSHIP_FOR_COMPANY";
    if (error instanceof Error && error.message === "FORBIDDEN") return "NO_MANAGED_COMPANY";
    if (error instanceof Error && (error.message === "NO_MANAGED_COMPANY" || error.message === "NO_MEMBERSHIP_FOR_COMPANY")) return error.message;
    throw error;
  });
  if (typeof context === "string") {
    const message = context === "NO_MANAGED_COMPANY" ? t("noCompany") : t("errors.NO_MEMBERSHIP_FOR_COMPANY");
    // The way back is a PrivateLink beside the block, not a HonestEmpty action: those render the
    // locale-aware Link, which would prefetch the private events page (the PrivateLink rule).
    return (
      <div className="portal-event-editor">
        <PortalPageHeader eyebrow={t("eyebrow")} title={t("newTitle")} />
        <HonestEmpty copy={message} headingLevel={2} title={t("unavailableTitle")} variant="inner" />
        <p className="portal-form-actions">
          <PrivateLink className="text-link" href={localizedPath(locale, "/portal/events")}>{t("backToEvents")}</PrivateLink>
        </p>
      </div>
    );
  }
  const dashboard = await getDashboard(actor);
  const choices = dashboard.companies.filter((company) => company.canManage && dashboard.memberships.some((membership) =>
    membership.companyId === company.id && isBenefitEligibleMembershipStatus(membership.status),
  ));
  return (
    <div className="portal-event-editor">
      <PortalPageHeader eyebrow={t("eyebrow")} lead={t("publishingFor", {company: context.companyName})} title={t("newTitle")}>
        <p className="portal-status-note">{t("quota", {used: context.usedThisQuarter, limit: Number.isFinite(context.limit) ? String(context.limit) : t("unlimited")})}</p>
      </PortalPageHeader>
      {choices.length > 1 ? <EventCompanyPicker action={localizedPath(locale, "/portal/events/new")} choices={choices} companyId={context.companyId} labels={{choose: t("chooseCompany"), use: t("useCompany"), changeWarning: t("changeCompanyWarning")}} /> : null}
      <EventForm action={saveMemberEventAction.bind(null, locale, context.companyId)} canSubmit={context.canPublish} canUploadHero={context.limit > 0} labels={eventFormLabels(t, tForms)} submitBlockedBy={submitBlockedReason(context)} values={null} />
    </div>
  );
}
