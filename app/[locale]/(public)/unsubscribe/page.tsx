import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {unsubscribeEnv} from "@/lib/config/env";
import {verifyUnsubscribeTokenWithAny} from "@/lib/email/unsubscribe-token";
import {buildPageMetadata} from "@/lib/metadata";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<{token?: string; status?: string}>;
}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Unsubscribe"});
  // The URL carries a signed token identifying a member, so this page must
  // never reach a search index.
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/unsubscribe",
    title: t("metaTitle"),
    description: t("metaDescription"),
    index: false,
  });
}

export default async function UnsubscribePage({params, searchParams}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Unsubscribe"});

  if (query.status === "success") {
    return (
      <section className="container mx-auto max-w-2xl px-6 py-20" data-unsubscribe-state="success">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("eyebrow")}</p>
        <h1 className="mt-3 text-4xl font-semibold">{t("successTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("successDescription")}</p>
      </section>
    );
  }

  const payload = query.token
    ? (() => {
      const env = unsubscribeEnv();
      return verifyUnsubscribeTokenWithAny(query.token!, [env.unsubscribeTokenSecret, env.cronSecret]);
    })()
    : null;
  /**
   * The signature and expiry decide this, not the locale the visitor landed in.
   *
   * Requiring `payload.locale` to equal the page locale rejected valid links.
   * The locale cookie lives for a year and `localePrefix` is `as-needed`, so a
   * recipient who has ever browsed the Chinese site is redirected from
   * `/unsubscribe` to `/zh/unsubscribe` before this renders — and an English
   * link then showed "this link is invalid" to someone holding a perfectly
   * good token. The token's locale still selects the success page, so nothing
   * about the confirmation is lost by honouring the link here.
   */
  const valid = payload !== null;

  if (!valid) {
    return (
      <section className="container mx-auto max-w-2xl px-6 py-20" data-unsubscribe-state="invalid">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("eyebrow")}</p>
        <h1 className="mt-3 text-4xl font-semibold">{t("invalidTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("invalidDescription")}</p>
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-2xl px-6 py-20" data-unsubscribe-state="confirm">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("eyebrow")}</p>
      <h1 className="mt-3 text-4xl font-semibold">{t("confirmTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("confirmDescription")}</p>
      <form action="/api/unsubscribe" method="post" className="mt-8">
        <input type="hidden" name="token" value={query.token} />
        <input type="hidden" name="redirect" value="1" />
        <button type="submit" className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground">
          {t("confirmAction")}
        </button>
      </form>
    </section>
  );
}
