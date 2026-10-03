import "server-only";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import {
  applyPageCopy,
  type PageCopyOverride,
} from "@/lib/i18n/apply-page-copy";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
export type HomeCopyProps = Readonly<{
  locale: AppLocale;
  copyOverrides?: readonly PageCopyOverride[];
}>;
/** Explicit private render input; no global/request cache contains a draft. */
export async function getHomeTranslations({
  locale,
  namespace,
  copyOverrides,
}: HomeCopyProps & Readonly<{ namespace: string }>) {
  if (copyOverrides === undefined)
    return getTranslations({ locale, namespace });
  const publicMessages = await getMessages({ locale });
  // Blank overrides mean shipped copy, including when public copy overrides it.
  const messages = applyPageCopy(
    { ...publicMessages, Home: (locale === "zh-HK" ? zh : en).Home },
    copyOverrides.filter((row) => row.value !== ""),
  );
  // Existing bundles intentionally contain arrays consumed through t.raw(); the
  // translator runtime preserves them although AbstractIntlMessages excludes arrays.
  return createTranslator({
    locale,
    messages: messages as unknown as AbstractIntlMessages,
    namespace,
  });
}
