import type {Metadata} from "next";
import {Noto_Sans, Noto_Sans_TC} from "next/font/google";
import {hasLocale, NextIntlClientProvider} from "next-intl";
import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import type {ReactNode} from "react";

import {routing} from "@/i18n/routing";

import "../globals.css";

// Family names stay "Noto Sans" and "Noto Sans TC" so they match --font-serif.
// next/font's Noto Sans TC subset is Latin; Chinese still falls through that
// named family when a full Noto Sans TC is installed.
const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-noto-sans",
  preload: true,
});

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-noto-sans-tc",
  preload: false,
});

type LocaleParams = {params: Promise<{locale: string}>};
type LocaleLayoutProps = LocaleParams & {children: ReactNode};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export async function generateMetadata({params}: LocaleParams): Promise<Metadata> {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({locale, namespace: "Metadata"});

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    title: t("title"),
    description: t("description"),
    icons: {
      icon: [
        {url: "/favicon.ico"},
        {url: "/favicon.svg", type: "image/svg+xml"},
        {url: "/favicon-32x32.png", sizes: "32x32", type: "image/png"},
        {url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png"},
      ],
      apple: [{url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png"}],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html className={`${notoSans.variable} ${notoSansTC.variable}`} lang={locale}>
      <body>
        <NextIntlClientProvider messages={{Error: messages.Error}}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
