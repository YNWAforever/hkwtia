import {getTranslations, setRequestLocale} from "next-intl/server";

import {ShowcaseReviewTable} from "@/components/admin/showcase-review-table";
import type {AppLocale} from "@/i18n/routing";
import {publishShowcaseListingAction, rejectShowcaseListingAction, setShowcasePremiumAction} from "@/lib/admin/showcase-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {showcaseRepository} from "@/lib/db/repos/showcase";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminListingsReviewPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const listings = await showcaseRepository.listForReview(actor);
  const t = await getTranslations({locale, namespace: "Admin.listingsReview"});
  const path = `/${locale}/admin/listings-review`;
  const labels = {caption: t("caption"), company: t("company"), slug: t("slug"), status: t("status"), premium: t("premium"), publish: t("publish"), reject: t("reject"), rejectionReason: t("rejectionReason"), savePremium: t("savePremium")};
  return <div className="space-y-8"><header className="space-y-3"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></header><ShowcaseReviewTable listings={listings} labels={labels} publishAction={publishShowcaseListingAction.bind(null, path)} rejectAction={rejectShowcaseListingAction.bind(null, path)} premiumAction={setShowcasePremiumAction.bind(null, path)} /></div>;
}
