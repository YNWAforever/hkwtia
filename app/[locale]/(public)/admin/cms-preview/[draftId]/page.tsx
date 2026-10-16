import { z } from "zod";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeContent } from "@/components/home/home-content";
import { requireAdminPageActor } from "@/lib/admin/page-auth";
import { readPrivateCopyDraft } from "@/lib/db/repos/page-copy";
import { isAuthorizationDenial } from "@/lib/auth/authorization-denial";
import type { AppLocale } from "@/i18n/routing";
import { localizedPath } from "@/lib/urls";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function PrivateHomePreview({
  params,
}: Readonly<{ params: Promise<{ locale: string; draftId: string }> }>) {
  const { locale, draftId } = await params;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  let draft;
  try {
    draft = await readPrivateCopyDraft(actor, draftId);
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      isAuthorizationDenial(error) ||
      (error instanceof Error &&
        ["CMS_DRAFTS_DISABLED", "PAGE_COPY_DRAFT_NOT_FOUND"].includes(
          error.message,
        ))
    )
      notFound();
    throw error;
  }
  if (draft.namespace !== "Home") notFound();
  const t = await getTranslations({
    locale,
    namespace: "Admin.pageCopy.serverDraft",
  });
  return (
    <>
      <aside className="shell py-4">
        <p>{t("private")}</p>
        <Link
          href={localizedPath(locale as AppLocale, "/admin/page-copy/Home")}
        >
          {t("back")}
        </Link>
      </aside>
      <HomeContent
        locale={locale as AppLocale}
        copyOverrides={draft.entries
          .filter((entry) => entry.locale === locale)
          .map((entry) => ({
            namespace: "Home",
            keyPath: entry.keyPath,
            value: entry.value,
          }))}
      />
    </>
  );
}
