import {getTranslations, setRequestLocale} from "next-intl/server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import type {ReactNode} from "react";

import {ConciergeWidget} from "@/components/ai/concierge-widget";
import {PortalNav} from "@/components/portal/portal-nav";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {localizeConcierge} from "@/lib/ai/concierge-labels";
import {publicEnv} from "@/lib/config/env";
import {parsePortalContinuation} from "@/lib/portal/continuation";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

/** Build the dedicated member sign-in redirect for an unauthenticated Portal visitor. */
function memberLoginPath(locale: AppLocale, continuation: string): string {
  const query = new URLSearchParams({next: continuation});
  return `${localizedPath(locale, "/member-login")}?${query.toString()}`;
}

export default async function PortalLayout({children, params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);

  try {
    await requireActor();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      const requestHeaders = await headers();
      const continuation = parsePortalContinuation(requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"));
      redirect(memberLoginPath(locale, continuation));
    }
    throw error;
  }

  const [t, concierge] = await Promise.all([
    getTranslations({locale, namespace: "Portal"}),
    getTranslations({locale, namespace: "Concierge"}),
  ]);
  const conciergeLabels = localizeConcierge((key) => concierge.raw(key));
  const {turnstileSiteKey} = publicEnv();

  return (
    <div className="min-h-screen bg-background">
      <PortalNav locale={locale} labels={{navigation: t("navigation"), dashboard: t("dashboard"), profile: t("profile"), company: t("company"), showcaseListing: t("showcaseListing.nav"), directory: t("directory.title"), events: t("events.title"), documents: t("documents.title"), billing: t("billing.title"), signOut: t("signOut")}} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <ConciergeWidget
        locale={locale}
        labels={conciergeLabels}
        {...(turnstileSiteKey === undefined ? {} : {turnstileSiteKey})}
      />
    </div>
  );
}
