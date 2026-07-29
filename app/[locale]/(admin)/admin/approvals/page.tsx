import {getTranslations, setRequestLocale} from "next-intl/server";


import {ApprovalList} from "@/components/admin/approval-list";
import type {AppLocale} from "@/i18n/routing";
import {decideApprovalAction} from "@/lib/admin/approval-actions";
import type {ApprovalActionMessages} from "@/lib/admin/approval-action-core";
import {listPendingApprovals} from "@/lib/admin/approvals";
import {requireAdminPageActor} from "@/lib/admin/page-auth";



type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function ApprovalsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const [actor, t] = await Promise.all([
    requireAdminPageActor(),
    getTranslations({locale, namespace: "Admin.approvals"}),
  ]);
  const approvals = await listPendingApprovals(actor);
  const messages: ApprovalActionMessages = {success: t("success"), validation: t("validation"), alreadyDecided: t("alreadyDecided"), notFound: t("notFound"), error: t("error")};
  const action = decideApprovalAction.bind(null, `/${locale}/admin/approvals`, messages);
  const labels = {
    caption: t("caption"), empty: t("empty"), actionType: t("actionType"), requestedAt: t("requestedAt"), summary: t("summary"), actions: t("actions"),
    approve: t("approve"), reject: t("reject"), deciding: t("deciding"), unavailable: t("unavailable"),
    memberReference: t("memberReference"), locale: t("locale"), agentRunReference: t("agentRunReference"),
    subject: t("subject"), body: t("body"), reasons: t("reasons"),
    actionTypes: {"campaign.send": t("actionTypes.campaignSend"), "event.publish": t("actionTypes.eventPublish"), "membership.update": t("actionTypes.membershipUpdate"), "agent.retention_outreach": t("actionTypes.retentionOutreach")},
    summaryFields: {campaignId: t("summaryFields.campaignId"), template: t("summaryFields.template"), eventId: t("summaryFields.eventId"), slug: t("summaryFields.slug"), membershipId: t("summaryFields.membershipId"), field: t("summaryFields.field")},
    reasonCodes: {low_score_declining: t("reasonCodes.lowScoreDeclining"), inactive_before_renewal: t("reasonCodes.inactiveBeforeRenewal")},
  };
  return <div className="space-y-8"><header><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></header><ApprovalList action={action} approvals={approvals} labels={labels} locale={locale}/></div>;
}
