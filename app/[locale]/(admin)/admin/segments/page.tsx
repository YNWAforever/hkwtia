import {randomUUID} from "node:crypto";

import {revalidatePath} from "next/cache";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {SegmentBuilder} from "@/components/admin/segment-builder";
import {SegmentResults, type QueueActionState} from "@/components/admin/segment-results";
import type {AppLocale} from "@/i18n/routing";
import {queueCampaign} from "@/lib/admin/campaigns";
import {parseSegmentRouteQuery, segmentFilterSchema} from "@/lib/admin/segment-schema";
import {previewSegment, saveSegment} from "@/lib/admin/segments";
import {requireAdminActor} from "@/lib/auth/actor";
import {segmentsRepository} from "@/lib/db/repos/segments";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

export default async function SegmentsPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminActor();
  const query = parseSegmentRouteQuery(await searchParams);
  const [preview, saved] = await Promise.all([previewSegment(actor, query), segmentsRepository.list(actor)]);
  const t = await getTranslations({locale, namespace: "Admin.segments"});
  async function saveAction(formData: FormData): Promise<void> {
    "use server";
    const actionActor = await requireAdminActor();
    const filters = segmentFilterSchema.parse(JSON.parse(String(formData.get("filters") ?? "{}")));
    await saveSegment(actionActor, {nameEn: formData.get("nameEn"), nameZh: formData.get("nameZh") || null, filter: filters});
    revalidatePath(localizedPath(locale, "/admin/segments"));
  }
  async function queueAction(_previous: QueueActionState, formData: FormData): Promise<QueueActionState> {
    "use server";
    const actionActor = await requireAdminActor();
    const result = await queueCampaign(actionActor, {
      segmentId: formData.get("segmentId"),
      template: formData.get("template"),
      localeStrategy: "profile",
      idempotencyKey: formData.get("idempotencyKey"),
    });
    revalidatePath(localizedPath(locale, "/admin/segments"));
    return {disposition: result.disposition, recipientCount: result.recipientCount};
  }
  const builderLabels = {preview: t("preview"), filters: t("filters"), tier: t("tier"), status: t("status"), scoreMin: t("scoreMin"), scoreMax: t("scoreMax"), renewalWithinDays: t("renewalWithinDays"), sector: t("sector"), lastLoginBeforeDays: t("lastLoginBeforeDays"), save: t("save"), nameEn: t("nameEn"), nameZh: t("nameZh"), corporate: t("corporate"), startup: t("startup"), community: t("community"), patron: t("patron"), active: t("active"), pastDue: t("pastDue"), pendingReview: t("pendingReview")};
  const resultsLabels = {caption: t("caption"), total: t("total"), empty: t("empty"), name: t("name"), email: t("email"), company: t("company"), plan: t("plan"), status: t("status"), renewal: t("renewal"), score: t("score"), unavailable: t("unavailable"), saved: t("saved"), export: t("export"), queue: t("queue"), template: t("template"), templateRenewal: t("templateRenewal"), templateUpdate: t("templateUpdate"), queued: t("queued"), existing: t("existing"), recipients: t("recipients")};
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1><p className="text-lg text-muted-foreground">{t("description")}</p></header><SegmentBuilder filter={query.filter} labels={builderLabels} locale={locale} saveAction={saveAction}/><SegmentResults labels={resultsLabels} preview={preview} queueAction={queueAction} queueKeys={Object.fromEntries(saved.map((segment) => [segment.id, randomUUID()]))} saved={saved}/></div>;
}