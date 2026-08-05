import {getTranslations, setRequestLocale} from "next-intl/server";

import {ShowcaseListingForm} from "@/components/portal/showcase-listing-form";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {getDashboard} from "@/lib/portal/queries";
import {saveShowcaseDraftAction, submitShowcaseListingAction} from "@/lib/showcase/member-actions";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function CompanyShowcaseListingPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const dashboard = await getDashboard(actor);
  const company = dashboard.companies[0];
  const t = await getTranslations({locale, namespace: "Portal"});
  if (!company) {
    return <section className="glass-card space-y-3 p-6"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("showcaseListing.eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("showcaseListing.title")}</h1><p className="text-muted-foreground">{t("companyEmpty")}</p></section>;
  }
  const listing = await showcaseRepository.getByCompany(actor, company.id);
  const labels = {
    title: t("showcaseListing.formTitle"), slug: t("showcaseListing.fields.slug"), nameEn: t("showcaseListing.fields.nameEn"), nameZhHk: t("showcaseListing.fields.nameZhHk"), taglineEn: t("showcaseListing.fields.taglineEn"), taglineZhHk: t("showcaseListing.fields.taglineZhHk"), descriptionEn: t("showcaseListing.fields.descriptionEn"), descriptionZhHk: t("showcaseListing.fields.descriptionZhHk"), category: t("showcaseListing.fields.category"), useCases: t("showcaseListing.fields.useCases"), deploymentOptions: t("showcaseListing.fields.deploymentOptions"), supportedLanguages: t("showcaseListing.fields.supportedLanguages"), worksWith: t("showcaseListing.fields.worksWith"), videoUrl: t("showcaseListing.fields.videoUrl"), caseStudyUrl: t("showcaseListing.fields.caseStudyUrl"), caseStudySummaryEn: t("showcaseListing.fields.caseStudySummaryEn"), caseStudySummaryZhHk: t("showcaseListing.fields.caseStudySummaryZhHk"), logoReference: t("showcaseListing.fields.logoReference"), saveDraft: t("showcaseListing.saveDraft"), submit: t("showcaseListing.submit"),
  } as const;
  const value = listing ? {
    slug: listing.slug, nameEn: listing.nameEn, nameZhHk: listing.nameZhHk, taglineEn: listing.taglineEn, taglineZhHk: listing.taglineZhHk, descriptionEn: listing.descriptionEn, descriptionZhHk: listing.descriptionZhHk, category: listing.category, useCases: listing.useCases, deploymentOptions: listing.deploymentOptions, supportedLanguages: listing.supportedLanguages, worksWith: listing.worksWith, videoUrl: listing.videoUrl, caseStudyUrl: listing.caseStudyUrl, caseStudySummaryEn: listing.caseStudySummaryEn, caseStudySummaryZhHk: listing.caseStudySummaryZhHk, logoReference: listing.logoReference,
  } : {};
  return <div className="mx-auto max-w-4xl space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("showcaseListing.eyebrow")}</p><h1 className="font-serif text-4xl font-semibold tracking-tight">{t("showcaseListing.title")}</h1><p className="text-muted-foreground">{t("showcaseListing.description")}</p></header><p className="text-sm text-muted-foreground">{listing ? t(`showcaseListing.status.${listing.status}`) : t("showcaseListing.status.draft")}</p><ShowcaseListingForm companyId={company.id} value={value} labels={labels} saveAction={company.canManage ? saveShowcaseDraftAction : undefined} submitAction={company.canManage ? submitShowcaseListingAction : undefined} readOnly={!company.canManage} /></div>;
}
