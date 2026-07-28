import {getMessages, getTranslations, setRequestLocale} from "next-intl/server";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import type {ReactNode} from "react";

import {ConciergeWidget, type ConciergeLabels} from "@/components/ai/concierge-widget";
import {PortalNav} from "@/components/portal/portal-nav";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {buildPortalSignInPath} from "@/lib/portal/queries";

export const dynamic = "force-dynamic";

type Props = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

function requestedPath(value: string | null): string {
  if (!value) return "/portal";
  try {
    const url = new URL(value, "http://portal.local");
    return url.origin === "http://portal.local" && url.pathname.startsWith("/portal") && !url.search && !url.hash ? url.pathname : "/portal";
  } catch {
    return "/portal";
  }
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
      const continuation = requestedPath(requestHeaders.get("next-url") ?? requestHeaders.get("x-invoke-path"));
      redirect(buildPortalSignInPath(locale, continuation));
    }
    throw error;
  }

  const t = await getTranslations({locale, namespace: "Portal"});
  const messages = await getMessages({locale});
  const conciergeLabels = messages.Concierge as ConciergeLabels;

  return (
    <div className="min-h-screen bg-background">
      <PortalNav locale={locale} labels={{navigation: t("navigation"), dashboard: t("dashboard"), profile: t("profile"), company: t("company"), directory: t("directory.title"), events: t("events.title"), documents: t("documents.title"), billing: t("billing.title"), signOut: t("signOut")}} />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <ConciergeWidget locale={locale} labels={conciergeLabels} />
    </div>
  );
}
