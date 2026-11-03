import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {siteConfig} from "@/config/site";
import type {AppLocale} from "@/i18n/routing";
import {buildPageMetadata} from "@/lib/metadata";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

// Mid-flow, member-specific step: keep it out of search results.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/join/checkout",
    title: t("metaTitle"),
    description: t("authDescription"),
    index: false,
  });
}

export default async function CheckoutPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  void searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Join");
  // Checkout stays closed while membership is paused. No fee and no Stripe handoff.
  return (
    <section className="glass-card p-6 sm:p-10">
      <h1 className="font-serif text-4xl font-semibold">{t("freezeTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("freezeNotice")}</p>
      <a className="mt-6 inline-flex text-primary underline" href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>
    </section>
  );
}
