import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MemberImportWizard, type MemberImportLabels} from "@/components/admin/member-import-wizard";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;
export default async function AdminMemberImportPage({params}: Props) {
  const {locale: rawLocale} = await params;
  const locale = rawLocale as AppLocale;
  setRequestLocale(locale);
  await requireAdminPageActor();
  const t = await getTranslations({locale, namespace: "Admin.imports"});
  if (process.env.ADMIN_BATCH_ENABLED !== "true" || process.env.MEMBER_IMPORT_ENABLED !== "true") return <div className="space-y-4"><h1 className="font-serif text-4xl font-semibold">{t("title")}</h1><p>{t("disabled")}</p><Link className="text-primary underline" href={localizedPath(locale, "/admin/members")}>{t("back")}</Link></div>;
  const fields = ["profileId", "displayName", "email", "locale", "planCode", "renewalAt", "tags", "ownerProfileId"] as const;
  const labels: MemberImportLabels = {downloadErrors: t("downloadErrors"), identityBoundary: t("identityBoundary"), reasons: t.raw("reasons") as Record<string,string>, title: t("title"), steps: [t("steps.upload"), t("steps.map"), t("steps.validate"), t("steps.preview"), t("steps.submit")], upload: t("upload"), chooseFile: t("chooseFile"), next: t("next"), error: t("error"), fields: Object.fromEntries(fields.map((field) => [field, t(`fields.${field}`)])), skip: t("skip"), validate: t("validate"), preview: t("preview"), confirm: t("confirm"), prepare: t("prepare"), selectAll: t("selectAll"), selected: String(t.raw("selected")), status: t("status"), reason: t("reason"), row: t("row"), before: t("before"), incoming: t("incoming"), total: t("total"), create: t("create"), update: t("update"), conflict: t("conflict"), invalid: t("invalid"), duplicate: t("duplicate"), unchanged: t("unchanged"), limits: t("limits")};
  return <div className="space-y-4"><Link className="text-primary underline" href={localizedPath(locale, "/admin/members")}>{t("back")}</Link><MemberImportWizard locale={locale} labels={labels}/></div>;
}
