import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {z} from "zod";

import {ArchiveToggle} from "@/components/admin/archive-toggle";
import {MediaForm} from "@/components/admin/media-form";
import type {AppLocale} from "@/i18n/routing";
import {setMediaArchivedAction, updateMediaAction} from "@/lib/admin/media-actions";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {mediaRepository} from "@/lib/db/repos/media";
import {localizedPath} from "@/lib/urls";

const idSchema = z.string().uuid();

type Props = Readonly<{params: Promise<{locale: string; id: string}>}>;

export default async function AdminMediaDetailPage({params}: Props) {
  const {locale: localeValue, id: rawId} = await params;
  const locale = localeValue as AppLocale;
  // Validate the untrusted route param before touching anything else.
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const entry = await mediaRepository.getForAdmin(actor, parsedId.data);
  if (!entry) notFound();
  const t = await getTranslations({locale, namespace: "Admin.media"});
  const updateAction = updateMediaAction.bind(
    null,
    parsedId.data,
    "/" + locale + "/admin/media/" + parsedId.data,
    {
      successMessage: t("updateSuccess"),
      urlInvalidMessage: t("urlInvalid"),
      urlConflictMessage: t("urlConflict"),
      validationMessage: t("validation"),
      errorMessage: t("error"),
    },
  );
  const alt = locale === "zh-HK" ? entry.altZh : entry.altEn;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">{alt}</h1>
        <p className="font-mono text-sm text-muted-foreground">{entry.url}</p>
        <Link className="text-sm underline" href={localizedPath(locale, "/admin/media")}>{t("back")}</Link>
      </header>
      <MediaForm
        action={updateAction}
        labels={{
          url: t("url"), urlHelp: t("urlHelp"), altEn: t("altEn"), altZh: t("altZh"),
          altHelp: t("altHelp"), preview: t("preview"), save: t("save"), saving: t("saving"),
        }}
        preview={{url: entry.url, alt}}
        values={entry}
      />
      <ArchiveToggle
        action={setMediaArchivedAction.bind(
          null,
          entry.id,
          localizedPath(locale, `/admin/media/${entry.id}`),
          entry.archivedAt === null,
        ) as never}
        archived={entry.archivedAt !== null}
        labels={{
          archive: t("archive"), unarchive: t("unarchive"), archiving: t("archiving"),
          archivedNotice: t("archivedNotice"), inUse: t("archiveInUse"), error: t("error"),
        }}
      />
    </div>
  );
}
