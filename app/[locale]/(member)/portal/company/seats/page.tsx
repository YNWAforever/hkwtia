import {CompanyFormScope, CompanySelector} from "@/components/portal/company-selector";
import {companySelectionNotice} from "@/components/portal/company-selection-notice";
import {selectPortalCompany, portalCompanyPath} from "@/lib/portal/company-context";
import {portalAccessNotice} from "@/components/portal/access-notice";
import {readPortalPage} from "@/lib/portal/access-state";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";
import {companyContinuation} from "@/lib/portal/continuation";

import {StatusLabel} from "@/components/wt/status-label";
import {PrivateLink} from "@/components/internal-shell/private-link";
import {SeatInviteForm} from "@/components/portal/seat-invite-form";
import {SeatBulkInvite, type SeatBulkLabels} from "@/components/portal/seat-bulk-invite";
import {SeatTable} from "@/components/portal/seat-table";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {getSeatOverview, getRecentSeatInviteBatches} from "@/lib/portal/seats";
import {formatPortalDate} from "@/lib/portal/format-date";
import {getSeatInviteBatch} from "@/lib/portal/seat-bulk-core";
import {localizedPath} from "@/lib/urls";

import {inviteSeatAction, revokeSeatAction, changeSeatRoleAction, revokeInvitationAction} from "@/lib/portal/seat-actions";
import {seatActionErrorKeys, type SeatFeedbackLabels} from "@/lib/portal/seat-action-state";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function PageHeader({eyebrow, title, lead}: {eyebrow: string; title: string; lead?: string}) {
  return (
    <header className="portal-welcome">
      <StatusLabel as="p">{eyebrow}</StatusLabel>
      <h1>{title}</h1>
      {lead ? <p className="portal-welcome-lead">{lead}</p> : null}
    </header>
  );
}

export default async function CompanySeatsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  const hasError = query.error === "1";
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, companyContinuation("/portal/company/seats", query.companyId, query.batchId));
  const t = await getTranslations({locale, namespace: "Portal"});
  const result = await readPortalPage(() => import("@/lib/portal/queries").then(({getDashboard}) => getDashboard(actor)));
  if (!result.ok) return portalAccessNotice(locale, result.access);
  const dashboard = result.value;
  const selection = selectPortalCompany(dashboard.companies, query.companyId);
  if (!selection.ok) return companySelectionNotice(locale, dashboard.companies, "/portal/company/seats");
  const company = selection.company;
  let overview = null;
  if (company) {
    try { overview = await getSeatOverview(actor, company.id); }
    catch (error) {if (!(error instanceof Error) || error.message !== "FORBIDDEN") throw error;}
  }
  if (!company || !overview) {
    return (
      <div>
        <PageHeader eyebrow={t("company")} title={t("seats.title")} />
        <p className="portal-field-help">{t(company ? "seats.unavailableForCompany" : "seats.empty")}</p>
        {company ? <div className="flex flex-wrap gap-3">
          <PrivateLink className="text-link" href={localizedPath(locale, "/portal/billing")}>{t("billing.title")}</PrivateLink>
          <PrivateLink className="text-link" href={localizedPath(locale, "/portal/company")}>{t("company")}</PrivateLink>
        </div> : null}
      </div>
    );
  }
  const used = overview.members.length + overview.invitations.length;
  let initialBatch;
  let batchUnavailable = false;
  if (overview.canManage && query.batchId !== undefined) {
    try { initialBatch = await getSeatInviteBatch(actor, {companyId: company.id, batchId: query.batchId}); }
    catch (error) {
      if (error instanceof z.ZodError || (error instanceof Error && ["BATCH_NOT_FOUND", "FORBIDDEN"].includes(error.message))) batchUnavailable = true;
      else throw error;
    }
  }
  const bulkLabels = t.raw("seats.bulk") as SeatBulkLabels;
  const recentBatches = overview.canManage ? await getRecentSeatInviteBatches(actor, company.id) : [];
  const isFull = used >= overview.seatLimit;
  const capacity = t("seats.capacity", {used, limit: overview.seatLimit});
  const feedback: SeatFeedbackLabels = {pending: t("seats.saving"), success: t("seats.saved"), errors: Object.fromEntries(seatActionErrorKeys.map((key) => [key, t(`seats.errors.${key}`)])) as SeatFeedbackLabels["errors"]};
  const labels = {details: t("seats.details"), unknownName: t("seats.unknownName"), revokeConfirm: t("seats.revokeConfirm", {member: "{member}"}), invitationConfirm: t("seats.invitationConfirm", {email: "{email}"}), members: t("seats.members"), pending: t("seats.pending"), email: t("seats.email"), role: t("seats.role"), revoke: t("seats.revoke"), inviteRevoke: t("seats.inviteRevoke"), changeRole: t("seats.changeRole"), owner: t("seats.owner"), admin: t("seats.admin"), member: t("seats.member"), noPending: t("seats.noPending"), actions: t("seats.actionsColumn")};
  // A legacy company above its limit would overflow the track, so the fill is capped at 100%.
  const fill = overview.seatLimit > 0 ? Math.min(100, Math.round((used / overview.seatLimit) * 100)) : 100;
  return (
    <CompanyFormScope key={company.id}>
      {dashboard.companies.length > 1 ? <CompanySelector action={localizedPath(locale, "/portal/company/seats")} companyId={company.id} choices={dashboard.companies} labels={{choose: t("companySelection.choose"), use: t("companySelection.use"), changeWarning: t("companySelection.changeWarning")}} /> : null}
      <p className="portal-status-note">{t("companySelection.selected", {company: company.displayName})}</p>
      <PageHeader eyebrow={t("company")} lead={t("seats.description")} title={t("seats.title")} />
      {/* Body text with an error rule, not the 11px eyebrow: it is a sentence the member has to read. */}
      {hasError ? <p className="portal-form-alert" role="alert">{t("seats.errors.generic")}</p> : null}
      {batchUnavailable ? <p className="portal-form-alert" role="alert">{t("seats.bulk.errors.expired")}</p> : null}
      <section className="portal-capacity">
        <p className="portal-capacity-text" id="seat-capacity-text">{capacity}</p>
        {/* Named by the sentence above rather than a copy of it, so it is announced once. aria-valuenow
          * may not exceed aria-valuemax, so a legacy company above its limit reports the limit; the
          * sentence still gives the real count. */}
        <div aria-labelledby="seat-capacity-text" aria-valuemax={overview.seatLimit} aria-valuemin={0} aria-valuenow={Math.min(used, overview.seatLimit)} className="portal-capacity-bar" role="progressbar">
          <span style={{width: `${fill}%`}} />
        </div>
      </section>
      {overview.canManage ? (
        isFull ? <p className="portal-seats-full-note">{t("seats.full")}</p> : <SeatInviteForm action={inviteSeatAction} feedback={feedback} canGrantOwner={overview.canGrantOwner} companyId={overview.companyId} labels={{email: t("seats.email"), invite: t("seats.invite"), inviting: t("seats.inviting"), role: t("seats.role"), member: t("seats.member"), admin: t("seats.admin"), owner: t("seats.owner")}} locale={locale} />
      ) : null}
      <SeatTable feedback={feedback} canGrantOwner={overview.canGrantOwner} canManage={overview.canManage} changeRoleAction={overview.canManage ? changeSeatRoleAction : undefined} invitations={overview.invitations} labels={labels} locale={locale} members={overview.members} revokeAction={overview.canManage ? revokeSeatAction : undefined} revokeInvitationAction={overview.canManage ? revokeInvitationAction : undefined} />
      {overview.canManage ? <SeatBulkInvite key={initialBatch?.batchId ?? "new-batch"} companyId={company.id} locale={locale} labels={bulkLabels} initialView={initialBatch} supportHref={localizedPath(locale, "/contact")}/> : null}
      {recentBatches.length ? <section className="space-y-3"><h2>{t("seats.bulk.recent")}</h2><ul>{recentBatches.map((batch) => <li key={batch.id}>
        {/* A full navigation also resets a newly created local batch when reopening the original URL. */}
        <a className="text-link" href={`${portalCompanyPath(localizedPath(locale, "/portal/company/seats"), company.id)}&${new URLSearchParams({batchId: batch.id})}`}>
          {formatPortalDate(locale, batch.createdAt)} — {t("seats.bulk.reference", {id: batch.id})}
        </a>
      </li>)}</ul></section> : null}
    </CompanyFormScope>
  );
}
