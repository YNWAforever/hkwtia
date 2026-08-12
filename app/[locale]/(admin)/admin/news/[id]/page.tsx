import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {ArchiveToggle} from "@/components/admin/archive-toggle";
import {NewsForm} from "@/components/admin/news-form";
import type {AppLocale} from "@/i18n/routing";
import {setNewsArchivedAction, updateNewsAction} from "@/lib/admin/news-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {adminPostsRepository} from "@/lib/db/repos/admin-posts";

const idSchema = z.string().uuid();

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminNewsDetailPage({params}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  // Validate the untrusted route param before touching anything else.
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const post = await adminPostsRepository.getForAdmin(actor, parsedId.data);
  if (!post) notFound();
  const t = await getTranslations({locale, namespace: "Admin.news"});
  const updateActionMessages = {
    successMessage: t("updateSuccess"),
    validationMessage: t("validation"),
    slugConflictMessage: t("slugConflict"),
    errorMessage: t("error"),
  };
  const updateAction = updateNewsAction.bind(
    null,
    parsedId.data,
    "/" + locale + "/admin/news/" + parsedId.data,
    updateActionMessages,
  );
  const labels = {
    slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), author: t("author"),
    bodyMdx: t("bodyMdx"), bodyHelp: t("bodyHelp"), published: t("published"),
    save: t("save"), saving: t("saving"),
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">
          {locale === "zh-HK" ? post.titleZh : post.titleEn}
        </h1>
        <p className="text-muted-foreground">
          {post.archivedAt
            ? t("statusArchived")
            : post.publishedAt ? t("statusPublished") : t("statusDraft")}
        </p>
      </header>
      <NewsForm action={updateAction} labels={labels} values={post}/>
      <ArchiveToggle
        action={setNewsArchivedAction.bind(
          null,
          parsedId.data,
          "/" + locale + "/admin/news/" + parsedId.data,
          post.archivedAt === null,
        ) as never}
        archived={post.archivedAt !== null}
        labels={{
          archive: t("archive"), unarchive: t("unarchive"), archiving: t("archiving"),
          archivedNotice: t("archivedNotice"), inUse: t("archiveInUse"), error: t("error"),
        }}
      />
    </div>
  );
}
