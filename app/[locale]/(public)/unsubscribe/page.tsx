import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {serverEnv} from "@/lib/config/env";
import {verifyUnsubscribeToken} from "@/lib/email/unsubscribe-token";

type Props = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<{token?: string; status?: string}>;
}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Unsubscribe"});
  return {title: t("metaTitle"), description: t("metaDescription")};
}

export default async function UnsubscribePage({params, searchParams}: Props) {
  const [{locale}, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Unsubscribe"});
  const appLocale: AppLocale = locale === "zh-HK" ? "zh-HK" : "en";

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
    ? verifyUnsubscribeToken(query.token, serverEnv().cronSecret)
    : null;
  const valid = payload?.locale === appLocale;

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
