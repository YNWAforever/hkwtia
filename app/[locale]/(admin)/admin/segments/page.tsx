import {randomUUID} from "node:crypto";


import {redirect} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {SegmentBuilder} from "@/components/admin/segment-builder";
import {SegmentResults} from "@/components/admin/segment-results";
import type {AppLocale} from "@/i18n/routing";
import {queueCampaignAction} from "@/lib/admin/campaign-actions";
import {campaignDraftHref, resolveCampaignDraft} from "@/lib/admin/campaigns";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {saveSegmentAction} from "@/lib/admin/segment-actions";
import {parseSegmentRouteQuery} from "@/lib/admin/segment-schema";
import {previewSegment} from "@/lib/admin/segments";
import {segmentsRepository} from "@/lib/db/repos/segments";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export default async function SegmentsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const rawSearchParams = await searchParams;
  const draft = resolveCampaignDraft(rawSearchParams.campaignDraft, randomUUID);
  if (draft.created) {
    redirect(campaignDraftHref(localizedPath(locale, "/admin/segments"), rawSearchParams, draft.draftId));
  }
  const segmentSearchParams = {...rawSearchParams};
  delete segmentSearchParams.campaignDraft;
  const query = parseSegmentRouteQuery(segmentSearchParams);
  const [preview, saved] = await Promise.all([previewSegment(actor, query), segmentsRepository.list(actor)]);
  const t = await getTranslations({locale, namespace: "Admin.segments"});
  const segmentPath = localizedPath(locale, "/admin/segments");
  const saveAction = saveSegmentAction.bind(null, segmentPath, {success: t("saveSuccess"), validation: t("saveValidation"), error: t("saveError")});
  const queueAction = queueCampaignAction.bind(null, draft.draftId, localizedPath(locale, "/admin/segments"));
  const builderLabels = {preview: t("preview"), filters: t("filters"), tier: t("tier"), status: t("status"), scoreMin: t("scoreMin"), scoreMax: t("scoreMax"), renewalWithinDays: t("renewalWithinDays"), sector: t("sector"), lastLoginBeforeDays: t("lastLoginBeforeDays"), save: t("save"), saving: t("saving"), nameEn: t("nameEn"), nameZh: t("nameZh"), corporate: t("corporate"), startup: t("startup"), community: t("community"), patron: t("patron"), active: t("active"), pastDue: t("pastDue"), pendingReview: t("pendingReview")};
  const resultsLabels = {caption: t("caption"), total: t("total"), empty: t("empty"), name: t("name"), email: t("email"), company: t("company"), plan: t("plan"), status: t("status"), renewal: t("renewal"), score: t("score"), unavailable: t("unavailable"), saved: t("saved"), export: t("export"), queue: t("queue"), template: t("template"), templateRenewal: t("templateRenewal"), templateUpdate: t("templateUpdate"), queued: t("queued"), existing: t("existing"), recipients: t("recipients"), newDraft: t("newDraft"), error: t("error")};
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header><SegmentBuilder filter={query.filter} labels={builderLabels} locale={locale} saveAction={saveAction}/><SegmentResults labels={resultsLabels} locale={locale} preview={preview} queueAction={queueAction} newDraftHref={campaignDraftHref(localizedPath(locale, "/admin/segments"), rawSearchParams, randomUUID())} saved={saved}/></div>;
}
