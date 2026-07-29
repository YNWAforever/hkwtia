import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {SafeGeneratedContent} from "@/components/admin/safe-generated-content";
import type {AppLocale} from "@/i18n/routing";
import {getBoardDraft} from "@/lib/admin/board-drafts";
import {requireAdminPageActor} from "@/lib/admin/page-auth";

type Props = Readonly<{
  params: Promise<{locale: string; id: string}>;
}>;

const idSchema = z.string().uuid();

export default async function BoardDraftPreviewPage({params}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  const id = idSchema.safeParse(rawId);
  if (!id.success) notFound();
  setRequestLocale(locale);

  const [actor, t] = await Promise.all([
    requireAdminPageActor(),
    getTranslations({locale, namespace: "Admin.reports"}),
  ]);
  const draft = await getBoardDraft(actor, id.data);
  if (!draft) notFound();

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Hong_Kong",
  });
  const title = locale === "zh-HK" ? draft.titleZh : draft.titleEn;
  const status = t(`boardDraftStatuses.${draft.agentRunStatus}`);

  return <article className="space-y-6">
    <header className="space-y-3">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{t("boardDraftPreviewEyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{t("boardDraftPreviewDescription")}</p>
    </header>
    <dl className="grid gap-3 rounded-2xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
      <div><dt className="font-medium">{t("boardDraftReportMonth")}</dt><dd className="text-muted-foreground">{draft.reportMonth}</dd></div>
      <div><dt className="font-medium">{t("boardDraftCreatedAt")}</dt><dd className="text-muted-foreground">{formatter.format(draft.createdAt)}</dd></div>
      <div><dt className="font-medium">{t("boardDraftAgentRunStatus")}</dt><dd className="text-muted-foreground">{status}</dd></div>
      <div><dt className="font-medium">{t("boardDraftAgentRunId")}</dt><dd className="break-all text-muted-foreground">{draft.agentRunId}</dd></div>
    </dl>
    <SafeGeneratedContent content={draft.bodyMdx} tableHeaders={{
      kpi: t("boardDraftKpi"),
      value: t("boardDraftValue"),
    }}/>
    <Link className="inline-flex rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted" href={`/${locale}/admin/reports`}>{t("boardDraftBack")}</Link>
  </article>;
}
