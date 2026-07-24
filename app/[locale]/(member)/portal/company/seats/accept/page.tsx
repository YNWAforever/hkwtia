import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {acceptSeatInvitation, SeatServiceError} from "@/lib/db/repos/seats";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

function queryValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export default async function SeatInvitationAcceptancePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Portal"});
  const token = queryValue(query.token);
  if (!token) return <section className="glass-card space-y-3 p-6 sm:p-10"><h1 className="font-serif text-3xl font-semibold">{t("seats.title")}</h1><p className="text-destructive" role="alert">{t("seats.errors.generic")}</p></section>;
  try {
    const actor = await requireActor();
    await acceptSeatInvitation(actor, token);
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (error instanceof SeatServiceError) return <section className="glass-card space-y-3 p-6 sm:p-10"><h1 className="font-serif text-3xl font-semibold">{t("seats.title")}</h1><p className="text-destructive" role="alert">{t("seats.errors.generic")}</p></section>;
    return <section className="glass-card space-y-3 p-6 sm:p-10"><h1 className="font-serif text-3xl font-semibold">{t("seats.title")}</h1><p className="text-destructive" role="alert">{t("seats.errors.generic")}</p></section>;
  }
}
