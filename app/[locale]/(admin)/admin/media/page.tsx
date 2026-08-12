import Image from "next/image";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MediaForm} from "@/components/admin/media-form";
import type {AppLocale} from "@/i18n/routing";
import {createMediaAction} from "@/lib/admin/media-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {mediaRepository} from "@/lib/db/repos/media";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function AdminMediaPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const entries = await mediaRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.media"});
  const createAction = createMediaAction.bind(null, "/" + locale + "/admin/media", {
    successMessage: t("createSuccess"),
    urlInvalidMessage: t("urlInvalid"),
    urlConflictMessage: t("urlConflict"),
    validationMessage: t("validation"),
    errorMessage: t("error"),
  });
  const labels = {
    url: t("url"), urlHelp: t("urlHelp"), altEn: t("altEn"), altZh: t("altZh"),
    altHelp: t("altHelp"), preview: t("preview"), save: t("create"), saving: t("saving"),
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </header>
      <MediaForm action={createAction} labels={labels}/>
      <section className="glass-card p-6">
        <h2 className="font-serif text-2xl font-semibold">{t("existing")}</h2>
        {entries.length
          ? <ul className="divide-y">{entries.map((entry) => (
            <li className="flex flex-wrap items-center gap-4 py-3" key={entry.id}>
              <span className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border/70 bg-muted/40">
                <Image
                  alt={locale === "zh-HK" ? entry.altZh : entry.altEn}
                  className="max-h-12 w-auto object-contain"
                  height={48}
                  src={entry.url}
                  width={96}
                />
              </span>
              <Link className="underline" href={localizedPath(locale, `/admin/media/${entry.id}`)}>
                {locale === "zh-HK" ? entry.altZh : entry.altEn}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">{entry.url}</span>
              {entry.archivedAt
                ? <span className="text-xs text-muted-foreground">{t("statusArchived")}</span>
                : null}
            </li>
          ))}</ul>
          : <p>{t("empty")}</p>}
      </section>
    </div>
  );
}
