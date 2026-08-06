import enMessages from "@/messages/en.json";
import zhHkMessages from "@/messages/zh-HK.json";

import type {AppLocale} from "@/i18n/routing";
import {
  pageCopyLeaves,
  pageCopyRejection,
  type PageCopyLeaf,
  type PageCopyRejection,
} from "@/lib/i18n/apply-page-copy";
import {pageCopyNamespaces, type PageCopyNamespace} from "@/lib/i18n/page-copy-scope";

const bundles: Readonly<Record<AppLocale, unknown>> = {
  "en": enMessages,
  "zh-HK": zhHkMessages,
};

/**
 * The English bundle is the catalog of what staff may edit. Driving the editor
 * fields and the save-time validation from the same source the code reads means
 * a field can never drift from a key `t()` actually resolves, and the set of
 * writable paths is fixed at build time rather than supplied by the request.
 */
const catalog = new Map<string, readonly PageCopyLeaf[]>();

function leavesFor(locale: AppLocale, namespace: PageCopyNamespace): readonly PageCopyLeaf[] {
  const cacheKey = `${locale}:${namespace}`;
  const cached = catalog.get(cacheKey);
  if (cached) return cached;
  const leaves = pageCopyLeaves(bundles[locale], namespace);
  catalog.set(cacheKey, leaves);
  return leaves;
}

/** Every editable path in a namespace, in bundle order. */
export function pageCopyCatalog(namespace: PageCopyNamespace): readonly PageCopyLeaf[] {
  return leavesFor("en", namespace);
}

/** Shipped values for one locale, shown as placeholders so staff see the fallback. */
export function pageCopyBundleValues(
  locale: AppLocale,
  namespace: PageCopyNamespace,
): ReadonlyMap<string, string> {
  return new Map(leavesFor(locale, namespace).map(({keyPath, value}) => [keyPath, value]));
}

export function pageCopyCatalogSizes(): Readonly<Record<PageCopyNamespace, number>> {
  return Object.fromEntries(
    pageCopyNamespaces.map((namespace) => [namespace, pageCopyCatalog(namespace).length]),
  ) as Record<PageCopyNamespace, number>;
}

/** Save-time validation, always against English so both locales share one shape. */
export function pageCopyEnglishRejection(
  override: Readonly<{namespace: string; keyPath: string; value: string}>,
): PageCopyRejection | null {
  return pageCopyRejection(enMessages, override);
}
