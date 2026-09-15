import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {CompanyForms} from "@/components/portal/company-forms";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {saveCompanyProfileAction} from "@/lib/portal/company-profile-actions";
import {updateCompanyAction} from "@/lib/portal/commands";
import {getDashboard} from "@/lib/portal/queries";
import {writerAssistProps} from "@/lib/portal/writer-ui";
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
  const company = dashboard.companies[0];

  if (!company) {
    return (
      <section className="glass-card space-y-3 p-6 sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("company")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t("companyTitle")}</h1>
        <p className="text-muted-foreground">{t("companyEmpty")}</p>
      </section>
    );
  }

  const canManage = company.canManage;
  // The profile form has no companyId field: `saveCompanyProfile` resolves the
  // first company the member *manages*. Show that same row's copy, or this
  // page would render one company's page while the Save button wrote another's.
  // With nothing managed it falls back to a read-only view of the first.
  const profileCompany = dashboard.companies.find((entry) => entry.canManage) ?? company;
  const writerT = await getTranslations({locale, namespace: "Portal.writer"});
  // A read-only view cannot save a generation, so do not spend the memberships
  // read and the run count on a control that is discarded. `CompanyForms` also
  // refuses the control unless both of its forms are savable.
  const writer = actor.kind === "member" && canManage ? await writerAssistProps("profile", actor, writerT) : null;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("company")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("companyTitle")}</h1>
        <p className="text-muted-foreground">{t("companyDescription")}</p>
      </header>
      <section className="space-y-3">
        <h2 className="font-serif text-3xl font-semibold tracking-tight">{tProfile("title")}</h2>
        <p className="text-muted-foreground">{tProfile("description")}</p>
      </section>
      <CompanyForms
        details={{
          values: {companyId: company.id, legalName: company.legalName, displayName: company.displayName, website: company.website ?? "", industry: company.industry ?? "", sizeBand: company.sizeBand ?? "", description: company.description ?? ""},
          labels: {legalName: t("fields.legalName"), displayName: t("fields.displayName"), website: t("fields.website"), industry: t("fields.industry"), sizeBand: t("fields.sizeBand"), description: t("fields.description"), save: t("save"), readOnly: t("readOnly")},
          action: canManage ? updateCompanyAction : undefined,
          canManage,
        }}
        profile={{
          values: {
            slug: profileCompany.slug ?? "", taglineEn: profileCompany.taglineEn ?? "", taglineZhHk: profileCompany.taglineZhHk ?? "",
            descriptionZhHk: profileCompany.descriptionZhHk ?? "", website: profileCompany.website ?? "", logoMediaId: profileCompany.logoMediaId ?? "",
            tags: profileCompany.tags, status: profileCompany.publicProfileStatus, rejectionReason: profileCompany.profileRejectionReason,
          },
          labels: {
            fields: {
              slug: tProfile("fields.slug"), taglineEn: tProfile("fields.taglineEn"), taglineZhHk: tProfile("fields.taglineZhHk"),
              descriptionZhHk: tProfile("fields.descriptionZhHk"), website: tProfile("fields.website"), tags: tProfile("fields.tags"),
              logoMediaId: tProfile("fields.logoMediaId"),
            },
            logo: {
              choose: tProfile("logo.choose"), alt: tProfile("logo.alt"), upload: tProfile("logo.upload"),
              uploading: tProfile("logo.uploading"), done: tProfile("logo.done"), failed: tProfile("logo.failed"),
            },
            status: {
              hidden: tProfile("status.hidden"), pending_review: tProfile("status.pending_review"),
              published: tProfile("status.published"), rejected: tProfile("status.rejected"),
            },
            statusLabel: tProfile("statusLabel"),
            reviewNotice: tProfile("reviewNotice"),
            // Interpolated here: the reason is data, and the client component
            // never carries a message formatter of its own.
            rejected: profileCompany.publicProfileStatus === "rejected" && profileCompany.profileRejectionReason
              ? tProfile("rejectedWith", {reason: profileCompany.profileRejectionReason})
              : null,
            save: tProfile("save"), publish: tProfile("publish"), saved: tProfile("saved"), submitted: tProfile("submitted"),
            readOnly: t("readOnly"), viewPublic: tProfile("viewPublic"),
            errors: {
              INVALID: tProfile("errors.INVALID"), FORBIDDEN: tProfile("errors.FORBIDDEN"),
              NO_MANAGED_COMPANY: tProfile("errors.NO_MANAGED_COMPANY"),
              INVALID_PROFILE_TRANSITION: tProfile("errors.INVALID_PROFILE_TRANSITION"),
              COMPANY_SLUG_TAKEN: tProfile("errors.COMPANY_SLUG_TAKEN"),
              COMPANY_LOGO_INVALID: tProfile("errors.COMPANY_LOGO_INVALID"),
            },
          },
          action: saveCompanyProfileAction.bind(null, locale),
          locale,
          readOnly: !profileCompany.canManage,
          publicHref: profileCompany.publicProfileStatus === "published" && profileCompany.slug ? localizedPath(locale, `/members/${profileCompany.slug}`) : null,
        }}
        writer={writer}
      />
    </div>
  );
}
