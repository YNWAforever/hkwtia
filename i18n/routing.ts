import {defineRouting} from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "zh-HK"],
  defaultLocale: "en",
  localePrefix: {
    mode: "as-needed",
    prefixes: {"zh-HK": "/zh"},
  },
  localeCookie: {maxAge: 60 * 60 * 24 * 365},
});

export type AppLocale = (typeof routing.locales)[number];
