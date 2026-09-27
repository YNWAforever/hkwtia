import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {BatchPreviewPanel, type BatchLabels} from "@/components/admin/batch-preview";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getBatchPreview} from "@/lib/admin/batches/service";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;
export default async function AdminBatchPage({params}: Props) {
  const {locale: rawLocale, id: rawId} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) notFound();
  const actor = await requireAdminPageActor();
  let preview;
  try {preview = await getBatchPreview(actor, id.data);}
  catch (error) {if (error instanceof Error && error.message === "BATCH_NOT_FOUND") notFound(); throw error;}
  const t = await getTranslations({locale, namespace: "Admin.batches"});
  const stateKeys = ["preparing", "ready", "queued", "running", "completed", "completed_with_errors", "cancelled", "expired", "pending", "succeeded", "skipped", "failed"] as const;
  const counterKeys = ["pending", "running", "succeeded", "skipped", "failed"] as const;
  const labels: BatchLabels = {title: t("title"), description: t("description"), back: t("back"), states: Object.fromEntries(stateKeys.map((key) => [key, t(`states.${key}`)])), counters: Object.fromEntries(counterKeys.map((key) => [key, t(`counters.${key}`)])), total: t("total"), eligible: t("eligible"), blocked: t("blocked"), operation: t("operation"), target: t("target"), before: t("before"), after: t("after"), reason: t("reason"), attempts: t("attempts"), result: t("result"), commit: t("commit"), retry: t("retry"), cancel: t("cancel"), expires: t("expires"), empty: t("empty")};
  const download = preview.operation === "export_members" && preview.state === "completed" && process.env.MEMBER_EXPORT_ENABLED === "true";
  return <div className="space-y-5"><Link className="text-primary underline" href={localizedPath(locale, "/admin/members")}>{labels.back}</Link><BatchPreviewPanel preview={preview} labels={labels}/>{["renewal_reminder", "profile_update_invite"].includes(preview.operation) ? <Link className="text-primary underline" href={localizedPath(locale, "/admin/campaigns")}>{t("reviewCampaigns")}</Link> : null}{download ? <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground" href={`/api/admin/batches/${id.data}/export`}>{t("downloadCsv")}</a> : null}</div>;
}
