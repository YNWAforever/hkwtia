import {getTranslations, setRequestLocale} from "next-intl/server";
import {auth} from "@/lib/auth/server";
import {redirect} from "next/navigation";

import {SeatInviteForm} from "@/components/portal/seat-invite-form";
import {SeatTable} from "@/components/portal/seat-table";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {changeSeatRole, inviteSeat, revokeInvitation, revokeSeat, type SeatRole} from "@/lib/db/repos/seats";
import {getSeatOverview} from "@/lib/portal/seats";
import {localizedPath} from "@/lib/urls";
import {serverEnv} from "@/lib/config/env";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function seatErrorPath(locale: AppLocale): string {
  return localizedPath(locale, "/portal/company/seats") + "?error=1";
}

function invitationCallbackUrl(locale: AppLocale, token: string): string {
  const url = new URL(localizedPath(locale, "/portal/company/seats/accept"), serverEnv().appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function inviteSeatAction(formData: FormData) {
  "use server";
  const actor = await requireActor();
  const locale = String(formData.get("locale") ?? "en") as AppLocale;
  try {
    const invitation = await inviteSeat(actor, String(formData.get("companyId") ?? ""), {email: String(formData.get("email") ?? ""), role: String(formData.get("role") ?? "member") as SeatRole});
    if (invitation.token) {
      const result = await auth.signIn.magicLink({email: invitation.invitedEmail, callbackURL: invitationCallbackUrl(locale, invitation.token)});
      if (result.error) throw new Error("INVITATION_DELIVERY_FAILED");
    }
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
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
  if (!company) return <section className="glass-card space-y-3 p-6 sm:p-10"><h1 className="font-serif text-4xl font-semibold">{t("seats.title")}</h1><p className="text-muted-foreground">{t("seats.empty")}</p></section>;
  const overview = await getSeatOverview(actor, company.id);
  if (!overview) return <section className="glass-card space-y-3 p-6 sm:p-10"><h1 className="font-serif text-4xl font-semibold">{t("seats.title")}</h1><p className="text-muted-foreground">{t("seats.empty")}</p></section>;
  const labels = {members: t("seats.members"), pending: t("seats.pending"), email: t("seats.email"), role: t("seats.role"), revoke: t("seats.revoke"), inviteRevoke: t("seats.inviteRevoke"), changeRole: t("seats.changeRole"), owner: t("seats.owner"), admin: t("seats.admin"), member: t("seats.member"), noPending: t("seats.noPending")};
  return <div className="mx-auto max-w-4xl space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("company")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight">{t("seats.title")}</h1><p className="text-muted-foreground">{t("seats.description")}</p>{hasError ? <p className="text-sm text-destructive" role="alert">{t("seats.errors.generic")}</p> : null}<p className="text-sm text-muted-foreground">{t("seats.capacity", {used: overview.members.length + overview.invitations.length, limit: overview.seatLimit})}</p></header>{overview.canManage ? <SeatInviteForm action={inviteSeatAction} canGrantOwner={overview.canGrantOwner} companyId={overview.companyId} labels={{email: t("seats.email"), invite: t("seats.invite"), inviting: t("seats.inviting"), role: t("seats.role"), member: t("seats.member"), admin: t("seats.admin"), owner: t("seats.owner")}} locale={locale} /> : null}<SeatTable canGrantOwner={overview.canGrantOwner} canManage={overview.canManage} changeRoleAction={overview.canManage ? changeSeatRoleAction : undefined} invitations={overview.invitations} labels={labels} locale={locale} members={overview.members} revokeAction={overview.canManage ? revokeSeatAction : undefined} revokeInvitationAction={overview.canManage ? revokeInvitationAction : undefined} /></div>;
}
