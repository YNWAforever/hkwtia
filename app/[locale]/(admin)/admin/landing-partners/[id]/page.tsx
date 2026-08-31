import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";
import {LandingPartnerForm, PartnerLifecycleControls} from "@/components/admin/landing-partner-form";
import type {AppLocale} from "@/i18n/routing";
import {setLandingPartnerArchivedAction, setLandingPartnerPublishedAction, updateLandingPartnerAction} from "@/lib/admin/landing-partner-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {landingPartnersRepository} from "@/lib/db/repos/landing-partners";

export default async function AdminLandingPartnerDetailPage({params}: {params: Promise<{locale: string; id: string}>}) {
  const {locale: raw, id: rawId} = await params; const locale = raw as AppLocale; setRequestLocale(locale); const actor = await requireAdminPageActor();
  const id = z.string().uuid().safeParse(rawId); if (!id.success) notFound();
  const [row, t] = await Promise.all([landingPartnersRepository.getForAdmin(actor, id.data), getTranslations({locale, namespace: "Admin.landingPartners"})]); if (!row) notFound();
  const labels = Object.fromEntries(["organizationEn","organizationZhHk","market","region","mouStatus","contactJson","notes","save","saving","mou_prospect","mou_in_discussion","mou_signed","mou_inactive"].map((key) => [key, t(key)]));
  const lifecycle = {...Object.fromEntries(["publish","unpublish","archive","unarchive","saving","error"].map((key) => [key, t(key)])), invalid: t("validation")};
  const path = `/${locale}/admin/landing-partners/${id.data}`;
  return <div className="space-y-8"><h1>{locale === "zh-HK" ? row.organizationZhHk : row.organizationEn}</h1><LandingPartnerForm action={updateLandingPartnerAction.bind(null, id.data, path, {successMessage: t("updateSuccess"), validationMessage: t("validation"), errorMessage: t("error")})} labels={labels} values={row}/><PartnerLifecycleControls archiveAction={setLandingPartnerArchivedAction.bind(null, id.data, path, !row.archivedAt)} archived={Boolean(row.archivedAt)} labels={lifecycle} publishAction={setLandingPartnerPublishedAction.bind(null, id.data, path, !row.publishedAt)} published={Boolean(row.publishedAt)}/></div>;
}
