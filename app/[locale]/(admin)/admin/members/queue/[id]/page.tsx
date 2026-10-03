import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { localizedPath } from "@/lib/urls";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import { applicationsRepository } from "@/lib/db/repos/applications";
import { adminMembersRepository } from "@/lib/db/repos/admin-members";
import { APPLICATION_MISSING_FIELDS, APPLICATION_NEXT_ACTIONS } from "@/lib/admin/application-case-types";
import { updateApplicationCaseAction } from "@/lib/admin/application-case-actions";
import { ApplicationCaseForm, type ApplicationCaseLabels } from "@/components/admin/application-case-form";
export default async function ApplicationCasePage({ params }: Readonly<{
    params: Promise<{
        locale: string;
        id: string;
    }>;
}>) {
    const { locale: rawLocale, id } = await params;
    const locale = rawLocale as AppLocale;
    setRequestLocale(locale);
    const actor = await requireAdminPageActor(`/admin/members/queue/${id}`);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        notFound();
    const record = await applicationsRepository.getApplicationCase(actor, id);
    if (!record)
        notFound();
    const owners = await adminMembersRepository.listOperationOwners(actor);
    const t = await getTranslations({ locale, namespace: "Admin" });
    const labels: ApplicationCaseLabels = { title: t("applicationCase.followUp"), description: t("applicationCase.description"), owner: t("applicationCase.owner"), unassigned: t("applicationCase.unassigned"), due: t("applicationCase.due"), missing: t("applicationCase.missing"), nextAction: t("applicationCase.nextAction"), note: t("applicationCase.note"), save: t("applicationCase.save"), saving: t("applicationCase.saving"), saved: t("applicationCase.saved"), conflict: t("applicationCase.conflict"), error: t("applicationCase.error"), refresh: t("applicationCase.refresh"), missingFields: Object.fromEntries(APPLICATION_MISSING_FIELDS.map(key => [key, t(`applicationCase.missingFields.${key}`)])), nextActions: Object.fromEntries(APPLICATION_NEXT_ACTIONS.map(key => [key, t(`applicationCase.nextActions.${key}`)])) };
    const href = localizedPath(locale, "/admin/members/queue/" + id);
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong" });
    return <div className="space-y-6"><Link className="inline-flex min-h-11 items-center text-primary underline" href={localizedPath(locale, "/admin/members/queue")}>{t("applicationCase.back")}</Link>
  <header className="space-y-3"><h1 className="font-serif text-4xl">{t("applicationCase.title")}</h1><Link className="text-primary underline" href={localizedPath(locale, "/admin/members/" + encodeURIComponent(record.application.profileId))}>{record.application.name}</Link><p className="break-all text-sm text-muted-foreground">{record.application.id}</p></header>
  <dl className="grid gap-4 rounded-md border p-5 sm:grid-cols-3">
   <div><dt className="font-medium">{t("applicationQueue.application")}</dt><dd>{record.application.status === "draft" ? t("applicationQueue.draft") : record.application.status === "completed" ? t("applicationCase.applicationCompleted") : record.application.status === "abandoned" ? t("applicationCase.applicationAbandoned") : t(`members.statusCodes.${record.application.status}`)}</dd></div>
   <div><dt className="font-medium">{t("applicationQueue.billing")}</dt><dd>{record.payment ? t(`applicationQueue.billingStates.${record.payment.state}`) : t("applicationCase.noPayment")}</dd></div>
   <div><dt className="font-medium">{t("applicationQueue.membership")}</dt><dd>{record.membership ? t(`members.statusCodes.${record.membership.status}`) : t("applicationQueue.none")}</dd></div>
  </dl><p className="text-sm text-muted-foreground">{t("applicationCase.independent")}</p>
  <ApplicationCaseForm record={record} owners={owners} labels={labels} action={updateApplicationCaseAction.bind(null, id, locale)} refreshHref={href}/>
  <section className="space-y-4 rounded-md border p-5"><h2 className="font-serif text-2xl">{t("applicationCase.timeline")}</h2>{record.timeline.length === 0 ? <p>{t("applicationCase.noHistory")}</p> : <ol className="space-y-4">{record.timeline.map(item => <li key={item.id} className="border-b pb-4"><time dateTime={item.at}>{date.format(new Date(item.at))}</time><p>{t(`applicationCase.nextActions.${item.case.nextActionCode}`)}</p>{item.note ? <p className="whitespace-pre-wrap text-sm">{item.note}</p> : null}<p className="text-sm text-muted-foreground">{t("applicationCase.owner")}: {owners.find(owner => owner.id === item.case.ownerProfileId)?.name ?? t("applicationCase.unassigned")}</p>{item.case.missingFields.length ? <p>{t("applicationCase.missing")}: {item.case.missingFields.map(field => t(`applicationCase.missingFields.${field}`)).join("、")}</p> : null}</li>)}</ol>}</section>
 </div>;
}
