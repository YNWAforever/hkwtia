import {hasLocale} from "next-intl";
import {getRequestConfig} from "next-intl/server";

import {routing} from "./routing";

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  const bundle = (await import(`../messages/${locale}.json`)).default;
  const messages = {...bundle};
  delete (messages as {_review?: boolean})._review;

  return {locale, messages};
});
