import {getTranslations, setRequestLocale} from "next-intl/server";

import {ShowcaseListingForm} from "@/components/portal/showcase-listing-form";
import {StatusLabel} from "@/components/wt/status-label";
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
  const tListing = await getTranslations({locale, namespace: "Portal.showcaseListing"});
  const tForms = await getTranslations({locale, namespace: "Portal.forms"});
  const tProfile = await getTranslations({locale, namespace: "Portal.companyProfile"});
  if (!company) {
    return (
      <div>
        <header className="portal-welcome">
          <StatusLabel as="p">{tListing("eyebrow")}</StatusLabel>
          <h1>{tListing("title")}</h1>
          <p className="portal-welcome-lead">{t("companyEmpty")}</p>
        </header>
      </div>
    );
  }
  const listing = await showcaseRepository.getByCompany(actor, company.id);
  const field = (name: string) => tListing(`fields.${name}`);
  const labels = {
    title: tListing("formTitle"),
    groups: {
      basics: tListing("groups.basics"), nameTagline: tListing("groups.nameTagline"), descriptions: tListing("groups.descriptions"),
      details: tListing("groups.details"), links: tListing("groups.links"),
    },
    fields: {
      slug: field("slug"), nameEn: field("nameEn"), nameZhHk: field("nameZhHk"), taglineEn: field("taglineEn"), taglineZhHk: field("taglineZhHk"),
      descriptionEn: field("descriptionEn"), descriptionZhHk: field("descriptionZhHk"), category: field("category"), useCases: field("useCases"),
      deploymentOptions: field("deploymentOptions"), supportedLanguages: field("supportedLanguages"), worksWith: field("worksWith"),
      videoUrl: field("videoUrl"), caseStudyUrl: field("caseStudyUrl"), caseStudySummaryEn: field("caseStudySummaryEn"),
      caseStudySummaryZhHk: field("caseStudySummaryZhHk"),
    },
    logo: {
      label: tProfile("fields.logo"), empty: tForms("image.empty"), previewAlt: tForms("image.previewAlt"),
      external: tForms("image.external"), remove: tForms("image.remove"),
      upload: {
        choose: tProfile("logo.choose"), alt: tProfile("logo.alt"), upload: tProfile("logo.upload"),
        uploading: tProfile("logo.uploading"), done: tProfile("logo.done"), failed: tProfile("logo.failed"),
      },
    },
    commaHelp: tForms("commaHelp"),
    readOnly: tForms("readOnlyNote"),
    saveDraft: tListing("saveDraft"),
    submit: tListing("submit"),
  } as const;
  const value = listing ? {
    slug: listing.slug, nameEn: listing.nameEn, nameZhHk: listing.nameZhHk, taglineEn: listing.taglineEn, taglineZhHk: listing.taglineZhHk, descriptionEn: listing.descriptionEn, descriptionZhHk: listing.descriptionZhHk, category: listing.category, useCases: listing.useCases, deploymentOptions: listing.deploymentOptions, supportedLanguages: listing.supportedLanguages, worksWith: listing.worksWith, videoUrl: listing.videoUrl, caseStudyUrl: listing.caseStudyUrl, caseStudySummaryEn: listing.caseStudySummaryEn, caseStudySummaryZhHk: listing.caseStudySummaryZhHk, logoReference: listing.logoReference,
  } : {};
  return (
    <div>
      <header className="portal-welcome">
        <StatusLabel as="p">{tListing("eyebrow")}</StatusLabel>
        <h1>{tListing("title")}</h1>
        <p className="portal-welcome-lead">{tListing("description")}</p>
      </header>
      <p className="portal-form-message" role="status"><StatusLabel>{listing ? tListing(`status.${listing.status}`) : tListing("status.draft")}</StatusLabel></p>
      <ShowcaseListingForm companyId={company.id} labels={labels} readOnly={!company.canManage} saveAction={company.canManage ? saveShowcaseDraftAction : undefined} submitAction={company.canManage ? submitShowcaseListingAction : undefined} value={value} />
    </div>
  );
}
