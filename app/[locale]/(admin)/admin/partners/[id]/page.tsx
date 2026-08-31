import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";
import {PartnerForm, PartnerLifecycleControls} from "@/components/admin/partner-form";
import type {AppLocale} from "@/i18n/routing";
import {setPartnerArchivedAction, setPartnerPublishedAction, updatePartnerAction} from "@/lib/admin/partner-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {mediaRepository} from "@/lib/db/repos/media";
import {partnersRepository} from "@/lib/db/repos/partners";

export default async function AdminPartnerDetailPage({params}: {params: Promise<{locale: string; id: string}>}) {
  const {locale: raw, id: rawId} = await params; const locale = raw as AppLocale; setRequestLocale(locale); const actor = await requireAdminPageActor();
  const id = z.string().uuid().safeParse(rawId); if (!id.success) notFound();
  const [row, mediaRows, t] = await Promise.all([partnersRepository.getForAdmin(actor, id.data), mediaRepository.listActiveForAdmin(actor), getTranslations({locale, namespace: "Admin.partners"})]); if (!row) notFound();
  const labels = Object.fromEntries(["nameEn","nameZhHk","category","websiteUrl","logoMediaId","noLogo","displayOrder","featured","relationshipStartsOn","relationshipEndsOn","relationshipConfirmed","logoRightsConfirmed","save","saving","category_supporting","category_media","category_regional","category_programme","category_sponsor"].map((key) => [key, t(key)]));
  const lifecycle = {...Object.fromEntries(["publish","unpublish","archive","unarchive","saving","error"].map((key) => [key, t(key)])), invalid: t("validation")};
  const path = `/${locale}/admin/partners/${id.data}`;
  return <div className="space-y-8"><h1>{locale === "zh-HK" ? row.nameZhHk : row.nameEn}</h1><PartnerForm action={updatePartnerAction.bind(null, id.data, path, {successMessage: t("updateSuccess"), validationMessage: t("validation"), errorMessage: t("error")})} labels={labels} mediaRows={mediaRows} values={{...row, relationshipConfirmed: Boolean(row.relationshipConfirmedAt), logoRightsConfirmed: Boolean(row.logoRightsConfirmedAt)}}/><PartnerLifecycleControls archiveAction={setPartnerArchivedAction.bind(null, id.data, path, !row.archivedAt)} archived={Boolean(row.archivedAt)} labels={lifecycle} publishAction={setPartnerPublishedAction.bind(null, id.data, path, !row.publishedAt)} published={Boolean(row.publishedAt)}/></div>;
}
