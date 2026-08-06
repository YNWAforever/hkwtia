import {hasLocale} from "next-intl";
import {getRequestConfig} from "next-intl/server";

import {applyPageCopy} from "@/lib/i18n/apply-page-copy";
import {pageCopyOverrides} from "@/lib/i18n/page-copy-cache";

import {routing} from "./routing";

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  const bundle = (await import(`../messages/${locale}.json`)).default;
  const shipped = {...bundle};
  delete (shipped as {_review?: boolean})._review;
  // Staff overrides replace individual leaf strings. The bundle stays the
  // fallback and the structural source of truth, and the loader never throws,
  // so an unreachable database serves shipped copy instead of failing the page.
  const messages = applyPageCopy(shipped, await pageCopyOverrides(locale));

  return {locale, messages};
});
