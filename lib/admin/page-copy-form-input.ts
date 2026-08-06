import {routing, type AppLocale} from "@/i18n/routing";
import {pageCopyCatalog} from "@/lib/i18n/page-copy-catalog";
import type {PageCopyNamespace} from "@/lib/i18n/page-copy-scope";

export type PageCopyEntryInput = Readonly<{
  locale: AppLocale;
  keyPath: string;
  value: string;
}>;

export type PageCopyFormResult = Readonly<{
  namespace: PageCopyNamespace;
  entries: readonly PageCopyEntryInput[];
}>;

/** Field names are derived from the catalog on both sides, never parsed back. */
export function pageCopyFieldName(locale: AppLocale, keyPath: string): string {
  return `copy:${locale}:${keyPath}`;
}

/**
 * Reads both locales' fields out of the submitted form.
 *
 * The entry list is driven by the build-time catalog rather than by the form's
 * own keys, so an injected field name is not merely rejected downstream — it is
 * never read at all. A blank field means "no override": the repository deletes
 * the row and the page falls back to its bundle value.
 */
export function pageCopyFormInput(
  namespace: PageCopyNamespace,
  formData: FormData,
): PageCopyFormResult {
  return {
    namespace,
    entries: routing.locales.flatMap((locale) =>
      pageCopyCatalog(namespace).map(({keyPath}) => ({
        locale,
        keyPath,
        value: String(formData.get(pageCopyFieldName(locale, keyPath)) ?? ""),
      }))),
  };
}
