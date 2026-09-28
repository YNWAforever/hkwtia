import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {BatchPreviewPanel, type BatchLabels} from "@/components/admin/batch-preview";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {getBatchPreview} from "@/lib/admin/batches/service";
import {adminBatchesRepository} from "@/lib/db/repos/admin-batches";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string; id: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>}>;
export default async function AdminBatchPage({params, searchParams}: Props) {
  const {locale: rawLocale, id: rawId} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) notFound();
  const actor = await requireAdminPageActor();
  const query = (await searchParams) ?? {};
  if (Object.keys(query).some(key => key !== "cursor")) notFound();
  const cursor = query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 2048)) notFound();
  let preview;
  try {preview = await getBatchPreview(actor, id.data, adminBatchesRepository, cursor);}
  catch (error) {if (error instanceof Error && ["BATCH_NOT_FOUND", "INVALID_CURSOR"].includes(error.message)) notFound(); throw error;}
  const t = await getTranslations({locale, namespace: "Admin.batches"});
  const stateKeys = ["preparing", "ready", "queued", "running", "completed", "completed_with_errors", "cancelled", "expired", "pending", "succeeded", "skipped", "failed"] as const;
  const counterKeys = ["pending", "running", "succeeded", "skipped", "failed"] as const;
  const labels: BatchLabels = {title: t("title"), description: t("description"), back: t("back"), states: Object.fromEntries(stateKeys.map((key) => [key, t(`states.${key}`)])), counters: Object.fromEntries(counterKeys.map((key) => [key, t(`counters.${key}`)])), total: t("total"), eligible: t("eligible"), blocked: t("blocked"), operation: t("operation"), target: t("target"), before: t("before"), after: t("after"), reason: t("reason"), attempts: t("attempts"), result: t("result"), commit: t("commit"), retry: t("retry"), cancel: t("cancel"), expires: t("expires"), empty: t("empty"), manualReview: t("history.manualReview"), more: t("more"), progressUnavailable: t("progressUnavailable"), locale, change: t("change"), noChange: t("noChange"), idLabel: t("idLabel"), targetTypes: t.raw("targetTypes") as Record<string, string>, fieldNames: t.raw("fieldNames") as Record<string, string>, reasonTransient: t("reasonTransient"), reasonChanged: t("reasonChanged"), reasonUnchanged: t("reasonUnchanged"), reasonOther: t("reasonOther")};
  const download = preview.state === "completed" && preview.counters.skipped === 0 && ((preview.operation === "export_members" && process.env.MEMBER_EXPORT_ENABLED === "true") || (preview.operation === "export_event_attendees" && process.env.EVENT_ATTENDEE_EXPORT_ENABLED === "true"));
  return <div className="space-y-5"><div className="flex flex-wrap gap-4"><Link className="text-primary underline" href={localizedPath(locale, "/admin/batches")}>{t("history.backToHistory")}</Link><Link className="text-primary underline" href={localizedPath(locale, "/admin/members")}>{labels.back}</Link></div><BatchPreviewPanel preview={preview} labels={labels} pageHref={localizedPath(locale, `/admin/batches/${id.data}`)}/>{["renewal_reminder", "profile_update_invite"].includes(preview.operation) ? <Link className="text-primary underline" href={localizedPath(locale, "/admin/campaigns")}>{t("reviewCampaigns")}</Link> : null}{download ? <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-primary-foreground" href={`/api/admin/batches/${id.data}/export`}>{t("downloadCsv")}</a> : null}</div>;
}
