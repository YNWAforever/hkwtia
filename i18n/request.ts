import {hasLocale} from "next-intl";
import {getRequestConfig} from "next-intl/server";

import {applyPageCopy} from "@/lib/i18n/apply-page-copy";
import {pageCopyOverrides} from "@/lib/i18n/page-copy-cache";

import {routing} from "./routing";

/**
 * Strips every `_`-prefixed bookkeeping key at any depth, copy-on-write.
 * `tests/unit/messages.test.ts` treats `_`-prefixed keys as non-content and
 * excludes them from leaf-key parity, so nothing downstream should ever see one.
 */
function withoutReviewFlags<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutReviewFlags) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, child]) => [key, withoutReviewFlags(child)]),
  ) as T;
}

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  const bundle = (await import(`../messages/${locale}.json`)).default;
  // Recursive, not just the root key: a nested `Concierge._review` was shipping
  // in the serialized message payload of every zh page because a shallow delete
  // never saw it. Internal review state does not belong in public HTML.
  const shipped = withoutReviewFlags(bundle);
  // Staff overrides replace individual leaf strings. The bundle stays the
  // fallback and the structural source of truth, and the loader never throws,
  // so an unreachable database serves shipped copy instead of failing the page.
  const messages = applyPageCopy(shipped, await pageCopyOverrides(locale));

  return {locale, messages};
});
