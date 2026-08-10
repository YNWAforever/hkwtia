import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {NewsForm} from "@/components/admin/news-form";
import type {AppLocale} from "@/i18n/routing";
import {createNewsAction} from "@/lib/admin/news-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {adminPostsRepository} from "@/lib/db/repos/admin-posts";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminNewsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const posts = await adminPostsRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.news"});
  const createActionMessages = {
    successMessage: t("createSuccess"),
    validationMessage: t("validation"),
    slugConflictMessage: t("slugConflict"),
    errorMessage: t("error"),
  };
  const createAction = createNewsAction.bind(null, "/" + locale + "/admin/news", createActionMessages);
  const labels = {
    slug: t("slug"), titleEn: t("titleEn"), titleZh: t("titleZh"), author: t("author"),
    bodyMdx: t("bodyMdx"), bodyHelp: t("bodyHelp"), published: t("published"),
    save: t("create"), saving: t("saving"),
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>
      <NewsForm action={createAction} labels={labels}/>
      <section className="glass-card p-6">
        <h2 className="font-serif text-2xl font-semibold">{t("existing")}</h2>
        {posts.length
          ? <ul className="divide-y">{posts.map((post) => (
            <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={post.id}>
              <Link className="underline" href={localizedPath(locale, `/admin/news/${post.id}`)}>
                {locale === "zh-HK" ? post.titleZh : post.titleEn}
              </Link>
              <span className="text-sm text-muted-foreground">
                {post.archivedAt
                  ? t("statusArchived")
                  : post.publishedAt ? t("statusPublished") : t("statusDraft")}
              </span>
            </li>
          ))}</ul>
          : <p>{t("empty")}</p>}
      </section>
    </div>
  );
}
