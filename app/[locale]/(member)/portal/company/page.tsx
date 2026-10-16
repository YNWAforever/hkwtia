import {PortalForm, PortalInput, PortalTextarea, PortalSubmit} from "@/components/portal/forms/portal-form";
import {portalFormLabels} from "@/lib/portal/form-state";
import {CompanyFormScope, CompanySelector} from "@/components/portal/company-selector";
import {companySelectionNotice} from "@/components/portal/company-selection-notice";
import {selectPortalCompany} from "@/lib/portal/company-context";
import {portalAccessNotice} from "@/components/portal/access-notice";
import {readPortalPage} from "@/lib/portal/access-state";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {CompanyProfileForm} from "@/components/portal/company-profile-form";
import {StatusLabel} from "@/components/wt/status-label";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {companyContinuation} from "@/lib/portal/continuation";
import {saveCompanyProfileAction} from "@/lib/portal/company-profile-actions";
import {updateCompanyAction} from "@/lib/portal/commands";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>}>;

export default async function CompanyPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, companyContinuation("/portal/company", (await searchParams)?.companyId));
  const result = await readPortalPage(() => getDashboard(actor));
  if (!result.ok) return portalAccessNotice(locale, result.access);
  const dashboard = result.value;
  const t = await getTranslations({locale, namespace: "Portal"});
  const tProfile = await getTranslations({locale, namespace: "Portal.companyProfile"});
  const tSections = await getTranslations({locale, namespace: "Portal.companySections"});
  const tForms = await getTranslations({locale, namespace: "Portal.forms"});
  const tListing = await getTranslations({locale, namespace: "Portal.showcaseListing"});
  const selection = selectPortalCompany(dashboard.companies, (await searchParams)?.companyId);
  if (!selection.ok) return companySelectionNotice(locale, dashboard.companies, "/portal/company");
  const company = selection.company;

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
  return (
    <CompanyFormScope key={company.id}>
      {dashboard.companies.length > 1 ? <CompanySelector action={localizedPath(locale, "/portal/company")} companyId={company.id} choices={dashboard.companies} labels={{choose: t("companySelection.choose"), use: t("companySelection.use"), changeWarning: t("companySelection.changeWarning")}} /> : null}
      <p className="portal-status-note">{t("companySelection.selected", {company: company.displayName})}</p>
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
        <PortalForm action={updateCompanyAction} labels={portalFormLabels(t)} readOnly={!canManage}>
          <PortalInput name="companyId" type="hidden" value={company.id} />
          <fieldset aria-labelledby="company-details-heading" className="portal-fieldset">
            <div className="portal-field">
              <label htmlFor="company-legalName">{t("fields.legalName")}</label>
              <PortalInput defaultValue={company.legalName} disabled={!canManage} id="company-legalName" name="legalName" required />
            </div>
            <div className="portal-field">
              <label htmlFor="company-displayName">{t("fields.displayName")}</label>
              <PortalInput defaultValue={company.displayName} disabled={!canManage} id="company-displayName" name="displayName" required />
            </div>
            <div className="portal-pair">
              <div className="portal-field">
                <label htmlFor="company-detail-website">{t("fields.website")}</label>
                <PortalInput defaultValue={company.website ?? ""} disabled={!canManage} id="company-detail-website" name="website" type="url" />
              </div>
              <div className="portal-field">
                <label htmlFor="company-industry">{t("fields.industry")}</label>
                <PortalInput defaultValue={company.industry ?? ""} disabled={!canManage} id="company-industry" name="industry" />
              </div>
            </div>
            <div className="portal-field">
              <label htmlFor="company-sizeBand">{t("fields.sizeBand")}</label>
              <PortalInput defaultValue={company.sizeBand ?? ""} disabled={!canManage} id="company-sizeBand" name="sizeBand" />
            </div>
            <div className="portal-field">
              <label htmlFor="company-description">{t("fields.description")}</label>
              <PortalTextarea defaultValue={company.description ?? ""} disabled={!canManage} id="company-description" name="description" />
            </div>
            {/* The marker tells `updateCompanyAction` this form rendered the switch; without it a
                save leaves the stored value alone (see `companyDirectoryVisibility`). */}
            <PortalInput disabled={!canManage} name="directoryVisibleShown" type="hidden" value="1" />
            <div className="portal-field portal-consent">
              <label className="portal-consent-row">
                <PortalInput aria-describedby="company-directory-help" defaultChecked={company.directoryVisible ?? false} disabled={!canManage} name="directoryVisible" type="checkbox" />
                <span>{tSections("details.directoryVisible")}</span>
              </label>
              <p className="portal-field-help" id="company-directory-help">{tSections("details.directoryHelp")}</p>
            </div>
          </fieldset>
          {canManage ? (
            <div className="portal-form-actions">
              <PortalSubmit />
            </div>
          ) : <p className="portal-readonly-note">{tForms("readOnlyNote")}</p>}
        </PortalForm>
      </section>
      <section aria-labelledby="company-public-heading" className="portal-form-section">
        <div className="portal-section-head">
          <h2 className="portal-section-title" id="company-public-heading">{tSections("public.title")}</h2>
          <p className="portal-section-purpose">{tSections("public.purpose")}</p>
        </div>
        <CompanyProfileForm
          companyId={company.id}
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
            rejected: company.publicProfileStatus === "rejected" && company.profileRejectionReason
              ? tProfile("rejectedWith", {reason: company.profileRejectionReason})
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
          publicHref={company.publicProfileStatus === "published" && company.slug ? localizedPath(locale, `/members/${company.slug}`) : null}
          readOnly={!company.canManage}
          values={{
            slug: company.slug ?? "", taglineEn: company.taglineEn ?? "", taglineZhHk: company.taglineZhHk ?? "",
            descriptionZhHk: company.descriptionZhHk ?? "", website: company.website ?? "", logoMediaId: company.logoMediaId ?? "",
            tags: company.tags, status: company.publicProfileStatus, rejectionReason: company.profileRejectionReason,
          }}
        />
      </section>
    </CompanyFormScope>
  );
}
