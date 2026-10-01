import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {PageCopyForm, type PageCopyField} from "@/components/admin/page-copy-form";
import type {AppLocale} from "@/i18n/routing";
import {savePageCopyAction} from "@/lib/admin/page-copy-actions";
import {pageCopyFieldName} from "@/lib/admin/page-copy-form-input";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {pageCopyRepository, pageCopyRevision} from "@/lib/db/repos/page-copy";
import {pageCopyBundleValues, pageCopyCatalog} from "@/lib/i18n/page-copy-catalog";
import {isPageCopyNamespace} from "@/lib/i18n/page-copy-scope";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string; namespace: string}>}>;

export default async function AdminPageCopyNamespacePage({params}: Props) {
  const {locale: localeValue, namespace: rawNamespace} = await params;
  const locale = localeValue as AppLocale;
  // Validate the untrusted route param against the allowlist before anything else.
  if (!isPageCopyNamespace(rawNamespace)) notFound();
  const namespace = rawNamespace;
  setRequestLocale(locale);
  const actor = await requireAdminPageActor();
  const overrides = await pageCopyRepository.listForAdmin(actor);
  const t = await getTranslations({locale, namespace: "Admin.pageCopy"});

  const stored = new Map(overrides
    .filter((row) => row.namespace === namespace)
    .map((row) => [`${row.locale}:${row.keyPath}`, row.value]));
  const enBundle = pageCopyBundleValues("en", namespace);
  const zhBundle = pageCopyBundleValues("zh-HK", namespace);
  const fields: readonly PageCopyField[] = pageCopyCatalog(namespace).map(({keyPath, value}) => ({
    keyPath,
    enBundle: value,
    zhBundle: zhBundle.get(keyPath) ?? enBundle.get(keyPath) ?? value,
    enField: pageCopyFieldName("en", keyPath),
    zhField: pageCopyFieldName("zh-HK", keyPath),
    enValue: stored.get(`en:${keyPath}`) ?? "",
    zhValue: stored.get(`zh-HK:${keyPath}`) ?? "",
  }));

  const action = savePageCopyAction.bind(
    null,
    namespace,
    "/" + locale + "/admin/page-copy/" + namespace,
    {
      successMessage: t("saveSuccess"),
      unchangedMessage: t("saveUnchanged"),
      validationMessage: t("validation"),
      errorMessage: t("error"),
      conflictMessage: t("editConflict"),
    },
  );

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t(`namespaces.${namespace}`)}</h1>
        <p className="text-muted-foreground">{t("editDescription")}</p>
        <Link className="text-sm underline" href={localizedPath(locale, "/admin/page-copy")}>{t("back")}</Link>
      </header>
      <PageCopyForm
        key={actor.profileId + ":" + namespace + ":" + pageCopyRevision(overrides.filter((row) => row.namespace === namespace))}
        action={action}
        localDraft={{identity: actor.profileId, namespace, labels: {
          saved: String(t.raw("localDraft.saved")), unavailable: t("localDraft.unavailable"), available: t("localDraft.available"),
          restore: t("localDraft.restore"), discard: t("localDraft.discard"), conflict: t("localDraft.conflict"),
          compare: t("localDraft.compare"), current: t("localDraft.current"), draft: t("localDraft.draft"),
        }}}
        fields={fields}
        revision={pageCopyRevision(overrides.filter((row) => row.namespace === namespace))}
        labels={{
          english: t("english"),
          chinese: t("chinese"),
          revertHint: t("revertHint"),
          save: t("save"),
          saving: t("saving"),
          previewDraft: t("previewDraft"), previewPrivate: t("previewPrivate"), previewEnglish: t("previewEnglish"), previewChinese: t("previewChinese"),
        }}
      />
    </div>
  );
}
