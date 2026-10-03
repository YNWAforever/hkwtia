import Link from "next/link";
import {notFound} from "next/navigation";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {PageCopyForm, type PageCopyField} from "@/components/admin/page-copy-form";
import type {AppLocale} from "@/i18n/routing";
import {savePageCopyAction, workspacePageCopyAction} from "@/lib/admin/page-copy-actions";
import {pageCopyFieldName} from "@/lib/admin/page-copy-form-input";
import {requireAdminPageActor} from "@/lib/admin/page-auth";
import {pageCopyRepository, pageCopyRevision, readCopyWorkspace} from "@/lib/db/repos/page-copy";
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
  const workspace = process.env.CMS_SERVER_DRAFTS_ENABLED === "true" ? await readCopyWorkspace(actor, namespace) : null;
  const edited = new Map(workspace?.draft?.entries.map(entry => [`${entry.locale}:${entry.keyPath}`, entry.value]) ?? stored);
  const enBundle = pageCopyBundleValues("en", namespace);
  const zhBundle = pageCopyBundleValues("zh-HK", namespace);
  const fields: readonly PageCopyField[] = pageCopyCatalog(namespace).map(({keyPath, value}) => ({
    keyPath,
    enBundle: value,
    zhBundle: zhBundle.get(keyPath) ?? enBundle.get(keyPath) ?? value,
    enField: pageCopyFieldName("en", keyPath),
    zhField: pageCopyFieldName("zh-HK", keyPath),
    enValue: edited.get(`en:${keyPath}`) ?? "",
    zhValue: edited.get(`zh-HK:${keyPath}`) ?? "",
  }));

  const bindMessages = {successMessage: t("saveSuccess"), unchangedMessage: t("saveUnchanged"), validationMessage: t("validation"), errorMessage: t("error"), conflictMessage: t("editConflict")};
  const action = workspace ? workspacePageCopyAction.bind(null,namespace,"/" + locale + "/admin/page-copy/" + namespace,{...bindMessages,draftSaved:t("serverDraft.saved"),published:t("serverDraft.published"),restored:t("serverDraft.restored")}) : savePageCopyAction.bind(
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
        key={actor.profileId + ":" + namespace}
        action={action}
        publishedBaseline={workspace ? Object.fromEntries(workspace.published.map(entry => [pageCopyFieldName(entry.locale,entry.keyPath),entry.value])) : undefined}
        serverDraft={workspace ? {id:workspace.draft?.id ?? null,revision:workspace.draft?.revision ?? null,stale:Boolean(workspace.draft && workspace.draft.baseRevision!==workspace.revision),previewBase:namespace==="Home" ? localizedPath(locale,"/admin/cms-preview/") : "",history:workspace.history.map(item=>({id:item.id,label:new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Hong_Kong"}).format(item.publishedAt!)})),labels:{save:t("serverDraft.save"),publish:t("serverDraft.publish"),private:t("serverDraft.private"),preview:t("serverDraft.preview"),history:t("serverDraft.history"),restore:t("serverDraft.restore"),previousCopy:t("serverDraft.previousCopy"),restored:t("serverDraft.restored"),stale:t("serverDraft.stale"),rebase:t("serverDraft.rebase"),current:t("serverDraft.current")}} : undefined}
        localDraft={{identity: actor.profileId, namespace, labels: {
          saved: String(t.raw("localDraft.saved")), unavailable: t("localDraft.unavailable"), available: t("localDraft.available"),
          restore: t("localDraft.restore"), discard: t("localDraft.discard"), conflict: t("localDraft.conflict"),
          compare: t("localDraft.compare"), current: t("localDraft.current"), draft: t("localDraft.draft"),
        }}}
        fields={fields}
        revision={workspace?.revision ?? pageCopyRevision(overrides.filter((row) => row.namespace === namespace))}
        labels={{
          workspace: {block: t("workspace.block"), search: t("workspace.search"), changedOnly: t("workspace.changedOnly"), previous: t("workspace.previous"), next: t("workspace.next"), reset: t("workspace.reset"), empty: t("workspace.empty")},
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
