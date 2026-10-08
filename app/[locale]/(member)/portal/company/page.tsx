import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {CompanyProfileForm} from "@/components/portal/company-profile-form";
import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {saveCompanyProfileAction} from "@/lib/portal/company-profile-actions";
import {updateCompanyAction} from "@/lib/portal/commands";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function CompanyPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout redirects anonymous visitors too, but Next renders layout and
  // page in parallel, so a page-level requireActor() would throw UNAUTHORIZED
  // into the runtime log on every anonymous hit (audit F21). `/portal/company`
  // is already in the continuation allowlist, so sign-in returns here.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent("/portal/company")}`);
  const dashboard = await getDashboard(actor);
  const t = await getTranslations({locale, namespace: "Portal"});
  const tProfile = await getTranslations({locale, namespace: "Portal.companyProfile"});
  const tSections = await getTranslations({locale, namespace: "Portal.companySections"});
  const tForms = await getTranslations({locale, namespace: "Portal.forms"});
  const tListing = await getTranslations({locale, namespace: "Portal.showcaseListing"});
  const company = dashboard.companies[0];

  if (!company) {
    return (
      <div>
        <header className="portal-welcome">
          <StatusLabel as="p">{t("company")}</StatusLabel>
          <h1>{t("companyTitle")}</h1>
          <p className="portal-welcome-lead">{t("companyEmpty")}</p>
        </header>
      </div>
    );
  }

  const canManage = company.canManage;
  // The profile form has no companyId field: `saveCompanyProfile` resolves the
  // first company the member *manages*. Show that same row's copy, or this
  // page would render one company's page while the Save button wrote another's.
  // With nothing managed it falls back to a read-only view of the first.
  const profileCompany = dashboard.companies.find((entry) => entry.canManage) ?? company;
  return (
    <div>
      <header className="portal-welcome">
        <StatusLabel as="p">{t("company")}</StatusLabel>
        <h1>{t("companyTitle")}</h1>
        <p className="portal-welcome-lead">{t("companyDescription")}</p>
      </header>
      <section aria-labelledby="company-details-heading" className="portal-form-section">
        <div className="portal-section-head">
          <h2 className="portal-section-title" id="company-details-heading">{tSections("details.title")}</h2>
          <p className="portal-section-purpose">{tSections("details.purpose")}</p>
        </div>
        <form action={canManage ? updateCompanyAction : undefined} className="portal-form">
          <input name="companyId" type="hidden" value={company.id} />
          <fieldset aria-labelledby="company-details-heading" className="portal-fieldset">
            <div className="portal-field">
              <label htmlFor="company-legalName">{t("fields.legalName")}</label>
              <input defaultValue={company.legalName} disabled={!canManage} id="company-legalName" name="legalName" required />
            </div>
            <div className="portal-field">
              <label htmlFor="company-displayName">{t("fields.displayName")}</label>
              <input defaultValue={company.displayName} disabled={!canManage} id="company-displayName" name="displayName" required />
            </div>
            <div className="portal-pair">
              <div className="portal-field">
                <label htmlFor="company-detail-website">{t("fields.website")}</label>
                <input defaultValue={company.website ?? ""} disabled={!canManage} id="company-detail-website" name="website" type="url" />
              </div>
              <div className="portal-field">
                <label htmlFor="company-industry">{t("fields.industry")}</label>
                <input defaultValue={company.industry ?? ""} disabled={!canManage} id="company-industry" name="industry" />
              </div>
            </div>
            <div className="portal-field">
              <label htmlFor="company-sizeBand">{t("fields.sizeBand")}</label>
              <input defaultValue={company.sizeBand ?? ""} disabled={!canManage} id="company-sizeBand" name="sizeBand" />
            </div>
            <div className="portal-field">
              <label htmlFor="company-description">{t("fields.description")}</label>
              <textarea defaultValue={company.description ?? ""} disabled={!canManage} id="company-description" name="description" />
            </div>
          </fieldset>
          {canManage ? (
            <div className="portal-form-actions">
              <button className="button" type="submit">{t("save")}</button>
            </div>
          ) : <p className="portal-readonly-note">{tForms("readOnlyNote")}</p>}
        </form>
      </section>
      <section aria-labelledby="company-public-heading" className="portal-form-section">
        <div className="portal-section-head">
          <h2 className="portal-section-title" id="company-public-heading">{tSections("public.title")}</h2>
          <p className="portal-section-purpose">{tSections("public.purpose")}</p>
        </div>
        <CompanyProfileForm
          action={saveCompanyProfileAction.bind(null, locale)}
          labels={{
            fields: {
              slug: tProfile("fields.slug"), taglineEn: tProfile("fields.taglineEn"), taglineZhHk: tProfile("fields.taglineZhHk"),
              descriptionZhHk: tProfile("fields.descriptionZhHk"), website: tProfile("fields.website"), tags: tProfile("fields.tags"),
            },
            groups: {address: tProfile("groups.address"), tagline: tProfile("groups.tagline"), description: tProfile("groups.description")},
            logo: {
              label: tProfile("fields.logo"), empty: tForms("image.empty"), previewAlt: tForms("image.previewAlt"),
              external: tForms("image.external"), remove: tForms("image.remove"),
              upload: {
                choose: tProfile("logo.choose"), alt: tProfile("logo.alt"), upload: tProfile("logo.upload"),
                uploading: tProfile("logo.uploading"), done: tProfile("logo.done"), failed: tProfile("logo.failed"),
              },
            },
            // Raw ICU text: the form is a client component and fills {count}/{max} as boxes are ticked.
            tagCounter: tForms.raw("tagCounter") as string,
            statusLabel: {
              hidden: tProfile("statusLabel.hidden"), pending_review: tProfile("statusLabel.pending_review"),
              published: tProfile("statusLabel.published"), rejected: tProfile("statusLabel.rejected"),
            },
            reviewNotice: tProfile("reviewNotice"),
            // Interpolated here: the reason is data, and the client component
            // never carries a message formatter of its own.
            rejected: profileCompany.publicProfileStatus === "rejected" && profileCompany.profileRejectionReason
              ? tProfile("rejectedWith", {reason: profileCompany.profileRejectionReason})
              : null,
            saveDraft: tListing("saveDraft"), submitForReview: tListing("submit"), saved: tProfile("saved"), submitted: tProfile("submitted"),
            saveChanges: t("save"), saveSendsForReview: tProfile("saveSendsForReview"), needsAddress: tProfile("needsAddress"),
            readOnly: tForms("readOnlyNote"), viewPublic: tProfile("viewPublic"),
            errors: {
              INVALID: tProfile("errors.INVALID"), FORBIDDEN: tProfile("errors.FORBIDDEN"),
              NO_MANAGED_COMPANY: tProfile("errors.NO_MANAGED_COMPANY"),
              INVALID_PROFILE_TRANSITION: tProfile("errors.INVALID_PROFILE_TRANSITION"),
              COMPANY_SLUG_TAKEN: tProfile("errors.COMPANY_SLUG_TAKEN"),
              COMPANY_LOGO_INVALID: tProfile("errors.COMPANY_LOGO_INVALID"),
            },
          }}
          locale={locale}
          publicHref={profileCompany.publicProfileStatus === "published" && profileCompany.slug ? localizedPath(locale, `/members/${profileCompany.slug}`) : null}
          readOnly={!profileCompany.canManage}
          values={{
            slug: profileCompany.slug ?? "", taglineEn: profileCompany.taglineEn ?? "", taglineZhHk: profileCompany.taglineZhHk ?? "",
            descriptionZhHk: profileCompany.descriptionZhHk ?? "", website: profileCompany.website ?? "", logoMediaId: profileCompany.logoMediaId ?? "",
            tags: profileCompany.tags, status: profileCompany.publicProfileStatus, rejectionReason: profileCompany.profileRejectionReason,
          }}
        />
      </section>
    </div>
  );
}
