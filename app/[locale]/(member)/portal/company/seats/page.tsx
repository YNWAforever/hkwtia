import {getTranslations, setRequestLocale} from "next-intl/server";
import {auth} from "@/lib/auth/server";
import {redirect} from "next/navigation";

import {StatusLabel} from "@/components/wt/status-label";
import {SeatInviteForm} from "@/components/portal/seat-invite-form";
import {SeatTable} from "@/components/portal/seat-table";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {changeSeatRole, inviteSeat, revokeInvitation, revokeSeat, type SeatRole} from "@/lib/db/repos/seats";
import {getSeatOverview} from "@/lib/portal/seats";
import {localizedPath} from "@/lib/urls";
import {appEnv} from "@/lib/config/env";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function seatErrorPath(locale: AppLocale): string {
  return localizedPath(locale, "/portal/company/seats") + "?error=1";
}

function invitationCallbackUrl(locale: AppLocale, token: string): string {
  const url = new URL(localizedPath(locale, "/portal/company/seats/accept"), appEnv().appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function inviteSeatAction(formData: FormData) {
  "use server";
  const actor = await requireActor();
  const locale = String(formData.get("locale") ?? "en") as AppLocale;
  let createdInvitation: Awaited<ReturnType<typeof inviteSeat>> | null = null;
  try {
    const invitation = await inviteSeat(actor, String(formData.get("companyId") ?? ""), {email: String(formData.get("email") ?? ""), role: String(formData.get("role") ?? "member") as SeatRole});
    createdInvitation = invitation;
    if (invitation.token) {
      const result = await auth.signIn.magicLink({email: invitation.invitedEmail, callbackURL: invitationCallbackUrl(locale, invitation.token)});
      if (result.error) throw new Error("INVITATION_DELIVERY_FAILED");
    }
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (createdInvitation?.token) await revokeInvitation(actor, createdInvitation.id).catch(() => undefined);
    redirect(seatErrorPath(locale));
  }
}

async function revokeSeatAction(formData: FormData) {
  "use server";
  const actor = await requireActor();
  const locale = String(formData.get("locale") ?? "en") as AppLocale;
  try {
    await revokeSeat(actor, String(formData.get("memberId") ?? ""));
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    redirect(seatErrorPath(locale));
  }
}

async function revokeInvitationAction(formData: FormData) {
  "use server";
  const actor = await requireActor();
  const locale = String(formData.get("locale") ?? "en") as AppLocale;
  try {
    await revokeInvitation(actor, String(formData.get("invitationId") ?? ""));
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    redirect(seatErrorPath(locale));
  }
}

async function changeSeatRoleAction(formData: FormData) {
  "use server";
  const actor = await requireActor();
  const locale = String(formData.get("locale") ?? "en") as AppLocale;
  try {
    await changeSeatRole(actor, String(formData.get("memberId") ?? ""), String(formData.get("role") ?? "member") as SeatRole);
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    redirect(seatErrorPath(locale));
  }
}
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
  const actor = await requireActor();
  const t = await getTranslations({locale, namespace: "Portal"});
  const dashboard = await import("@/lib/portal/queries").then(({getDashboard}) => getDashboard(actor));
  const company = dashboard.companies[0];
  const overview = company ? await getSeatOverview(actor, company.id) : null;
  if (!overview) {
    return (
      <div>
        <PageHeader eyebrow={t("company")} title={t("seats.title")} />
        <p className="portal-field-help">{t("seats.empty")}</p>
      </div>
    );
  }
  const used = overview.members.length + overview.invitations.length;
  const isFull = used >= overview.seatLimit;
  const capacity = t("seats.capacity", {used, limit: overview.seatLimit});
  const labels = {members: t("seats.members"), pending: t("seats.pending"), email: t("seats.email"), role: t("seats.role"), revoke: t("seats.revoke"), inviteRevoke: t("seats.inviteRevoke"), changeRole: t("seats.changeRole"), owner: t("seats.owner"), admin: t("seats.admin"), member: t("seats.member"), noPending: t("seats.noPending"), actions: t("seats.actionsColumn")};
  // A legacy company above its limit would overflow the track, so the fill is capped at 100%.
  const fill = overview.seatLimit > 0 ? Math.min(100, Math.round((used / overview.seatLimit) * 100)) : 100;
  return (
    <div>
      <PageHeader eyebrow={t("company")} lead={t("seats.description")} title={t("seats.title")} />
      {/* Body text with an error rule, not the 11px eyebrow: it is a sentence the member has to read. */}
      {hasError ? <p className="portal-form-alert" role="alert">{t("seats.errors.generic")}</p> : null}
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
        isFull ? <p className="portal-seats-full-note">{t("seats.full")}</p> : <SeatInviteForm action={inviteSeatAction} canGrantOwner={overview.canGrantOwner} companyId={overview.companyId} labels={{email: t("seats.email"), invite: t("seats.invite"), inviting: t("seats.inviting"), role: t("seats.role"), member: t("seats.member"), admin: t("seats.admin"), owner: t("seats.owner")}} locale={locale} />
      ) : null}
      <SeatTable canGrantOwner={overview.canGrantOwner} canManage={overview.canManage} changeRoleAction={overview.canManage ? changeSeatRoleAction : undefined} invitations={overview.invitations} labels={labels} locale={locale} members={overview.members} revokeAction={overview.canManage ? revokeSeatAction : undefined} revokeInvitationAction={overview.canManage ? revokeInvitationAction : undefined} />
    </div>
  );
}
