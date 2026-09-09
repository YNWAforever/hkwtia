import {getTranslations, setRequestLocale} from "next-intl/server";

import {ProfileReviewTable, type ProfileReviewRow} from "@/components/admin/profile-review-table";
import type {AppLocale} from "@/i18n/routing";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {approveCompanyProfileAction, rejectCompanyProfileAction} from "@/lib/admin/profile-review-actions";
import {companyProfilesRepository} from "@/lib/db/repos/company-profiles";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminProfilesReviewPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const [pendingRows, t] = await Promise.all([
    // A failed queue read must not look like an empty queue: null renders an
    // explicit error, because "nothing to review" and "we could not ask" are
    // different answers and only one of them means staff can stop looking.
    companyProfilesRepository.listForReview(actor).catch(() => null),
    getTranslations({locale, namespace: "Admin.profilesReview"}),
  ]);
  const path = `/${locale}/admin/profiles-review`;
  // Snake_case rows from the raw-SQL seam, mapped field by field so the table
  // never renders a raw database row. `website` is already through the public
  // https policy in the repository; `tags` is optional on the row schema.
  const reviewRows: ProfileReviewRow[] | null = pendingRows === null ? null : pendingRows.map((row) => ({
    id: row.id, name: row.display_name, slug: row.slug ?? null, tags: row.tags ?? [], website: row.website ?? null,
    taglineEn: row.tagline_en ?? null, taglineZhHk: row.tagline_zh_hk ?? null, descriptionZhHk: row.description_zh_hk ?? null,
    logoUrl: row.logo_url,
  }));
  const labels = {caption: t("caption"), company: t("company"), slug: t("slug"), tags: t("tags"), preview: t("preview"), approve: t("approve"), reject: t("reject"), rejectionReason: t("rejectionReason"), empty: t("empty"), taglineEn: t("taglineEn"), taglineZhHk: t("taglineZhHk"), descriptionZhHk: t("descriptionZhHk"), website: t("website"), previewEmpty: t("previewEmpty")};
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></header><section className="glass-card p-6">{reviewRows === null ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-4 text-destructive" role="alert">{t("error")}</p> : <ProfileReviewTable approveAction={approveCompanyProfileAction.bind(null, path)} labels={labels} locale={locale} rejectAction={rejectCompanyProfileAction.bind(null, path)} rows={reviewRows}/>}</section></div>;
}
