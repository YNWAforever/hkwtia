import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {PrivateLink} from "@/components/internal-shell/private-link";
import {HonestEmpty} from "@/components/wt/honest-empty";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {acceptSeatInvitation, SeatServiceError} from "@/lib/db/repos/seats";
import {seatInvitationErrorKey} from "@/lib/portal/seat-invitation-errors";
import {localizedPath} from "@/lib/urls";

type Props = Readonly<{params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>}>;

// The error is server-rendered at load, so HonestEmpty's own polite role="status" is the one live
// region. Its inner variant renders an h3, so the page's one h1 is the screen-reader page title.
function AcceptError({pageTitle, title, message, back, locale}: {pageTitle: string; title: string; message: string; back: string; locale: AppLocale}) {
  return (
    <div>
      <h1 className="sr-only">{pageTitle}</h1>
      <HonestEmpty copy={message} title={title} variant="inner" />
      <p className="portal-form-actions">
        <PrivateLink className="text-link" href={localizedPath(locale, "/portal")}>{back}</PrivateLink>
      </p>
    </div>
  );
}

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
  if (!token) return <AcceptError pageTitle={t("company")} back={t("seats.acceptBack")} locale={locale} message={t("seats.errors.generic")} title={t("seats.title")} />;
  try {
    const actor = await requireActor();
    await acceptSeatInvitation(actor, token);
    redirect(localizedPath(locale, "/portal/company/seats"));
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (error instanceof SeatServiceError) {
      const message = t(`seats.errors.${seatInvitationErrorKey(error.code)}`);
      return <AcceptError pageTitle={t("company")} back={t("seats.acceptBack")} locale={locale} message={message} title={t("seats.title")} />;
    }
    return <AcceptError pageTitle={t("company")} back={t("seats.acceptBack")} locale={locale} message={t("seats.errors.generic")} title={t("seats.title")} />;
  }
}
