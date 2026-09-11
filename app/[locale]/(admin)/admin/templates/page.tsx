import {getTranslations, setRequestLocale} from "next-intl/server";

import {
  TemplateRegistryTable,
  type TemplateRegistryRow,
} from "@/components/admin/template-registry-table";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {
  approveTemplateAction,
  disableTemplateAction,
  rejectTemplateAction,
  saveTemplatePreviewsAction,
} from "@/lib/admin/template-registry-actions";
import {whatsappTemplatesRepository} from "@/lib/db/repos/whatsapp-templates";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminTemplatesPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const [records, t] = await Promise.all([
    // A failed read must not look like an empty registry: `null` renders an
    // explicit error, because "nothing registered" and "we could not ask" are
    // different answers and only one of them means the operator allowlist is
    // still the gate (S-14).
    whatsappTemplatesRepository.list(actor).catch(() => null),
    getTranslations({locale, namespace: "Admin.templates"}),
  ]);
  // The INTERNAL app-router path: `revalidatePath` does not go through
  // `localizedPath`, and `/zh-HK/…` is the correct spelling there.
  const path = `/${locale}/admin/templates`;
  const rows: TemplateRegistryRow[] | null = records === null ? null : records.map((record) => ({
    key: record.key,
    elementName: record.elementName,
    languageCode: record.languageCode,
    category: record.category,
    variables: record.variables,
    status: record.status,
    // ISO rather than a locale format: this is the date a named admin approved
    // a template, and it is read back against the WOZTELL console's own log.
    approvedAt: record.approvedAt ? record.approvedAt.toISOString().slice(0, 10) : null,
    rejectionReason: record.rejectionReason,
    previewEn: record.previews.en ?? "",
    previewZhHk: record.previews["zh-HK"] ?? "",
  }));
  const labels = {
    caption: t("title"),
    key: t("columns.key"),
    elementName: t("columns.elementName"),
    language: t("columns.language"),
    category: t("columns.category"),
    variables: t("columns.variables"),
    status: t("columns.status"),
    approvedAt: t("columns.approvedAt"),
    approve: t("approve"),
    reject: t("reject"),
    disable: t("disable"),
    rejectionReason: t("rejectionReason"),
    previewEn: t("previewEn"),
    previewZhHk: t("previewZhHk"),
    savePreview: t("savePreview"),
    empty: t("empty"),
    statusLabel: {
      pending: t("status.pending"),
      approved: t("status.approved"),
      rejected: t("status.rejected"),
      disabled: t("status.disabled"),
    },
    categoryLabel: {
      marketing: t("category.marketing"),
      utility: t("category.utility"),
      authentication: t("category.authentication"),
    },
  } as const;
  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        {/* The first line of the C-9 go-live checklist, on the page that can
            answer it: 0034 seeds every key `pending`, so a deploy that flips
            RUN_LIVE_WOZTELL with nothing approved here sends nothing and looks
            broken. Saying so where staff are standing is cheaper than the
            support thread. */}
        <p className="rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{t("goLive")}</p>
      </header>
      <section className="glass-card p-6">
        {rows === null
          ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p>
          : <TemplateRegistryTable
            approveAction={approveTemplateAction.bind(null, path)}
            disableAction={disableTemplateAction.bind(null, path)}
            labels={labels}
            rejectAction={rejectTemplateAction.bind(null, path)}
            rows={rows}
            savePreviewsAction={saveTemplatePreviewsAction.bind(null, path)}
          />}
      </section>
    </div>
  );
}
