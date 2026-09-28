import {getTranslations, setRequestLocale} from "next-intl/server";
import Link from "next/link";
import {notFound} from "next/navigation";

import {ShowcaseReviewTable, type ShowcasePreviewFields} from "@/components/admin/showcase-review-table";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";
import {publishShowcaseListingAction, rejectShowcaseListingAction, setShowcaseLogoAction, setShowcasePremiumAction} from "@/lib/admin/showcase-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {mediaRepository} from "@/lib/db/repos/media";
import {showcaseRepository} from "@/lib/db/repos/showcase";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams?: Promise<Record<string, string | string[] | undefined>>}>;

export default async function AdminListingsReviewPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const query = searchParams ? await searchParams : {};
  if (Object.keys(query).some(key => !["status", "cursor"].includes(key))) notFound();
  const status = query.status;
  const cursor = query.cursor;
  if (status !== undefined && status !== "pending_review") notFound();
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 1000)) notFound();
  let page;
  try {page = await showcaseRepository.listForReview(actor, status === "pending_review" ? status : undefined, cursor);}
  catch (error) {if (error instanceof Error && error.message === "INVALID_CURSOR") notFound(); throw error;}
  const mediaOptions = (await mediaRepository.listActiveForAdmin(actor)).map((entry) => ({
    id: entry.id,
    label: locale === "zh-HK" ? entry.altZh : entry.altEn,
  }));
  const t = await getTranslations({locale, namespace: "Admin.listingsReview"});
  const portalT = await getTranslations({locale, namespace: "Portal.showcaseListing"});
  const path = `/${locale}/admin/listings-review`;
  const labels = {caption: t("caption"), company: t("company"), slug: t("slug"), logo: t("logo"), status: t("status"), premium: t("premium"), preview: t("preview"), fields: portalT.raw("fields") as ShowcasePreviewFields, publish: t("publish"), reject: t("reject"), rejectionReason: t("rejectionReason"), savePremium: t("savePremium"), logoNone: t("logoNone"), saveLogo: t("saveLogo")};
  return <div className="space-y-8">
    <header className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
      <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
    </header>
    <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-4 text-sm">
      <Link aria-current={status === "pending_review" ? "page" : undefined} className="underline" href={localizedPath(locale, "/admin/listings-review?status=pending_review")}>{t("filterPending")}</Link>
      <Link aria-current={status === undefined ? "page" : undefined} className="underline" href={localizedPath(locale, "/admin/listings-review")}>{t("filterAll")}</Link>
    </nav>
    <ShowcaseReviewTable
      listings={page.items}
      labels={labels}
      publishAction={publishShowcaseListingAction.bind(null, path)}
      rejectAction={rejectShowcaseListingAction.bind(null, path)}
      premiumAction={setShowcasePremiumAction.bind(null, path)}
      logoAction={setShowcaseLogoAction.bind(null, path)}
      mediaOptions={mediaOptions}
    />
    {page.nextCursor ? <nav aria-label={t("pagination")}><Link className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm" href={localizedPath(locale, `/admin/listings-review?${new URLSearchParams({...status ? {status} : {}, cursor: page.nextCursor}).toString()}`)}>{t("next")}</Link></nav> : null}
  </div>;
}
