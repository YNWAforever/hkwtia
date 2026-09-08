import {getTranslations, setRequestLocale} from "next-intl/server";

import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {saveMemberEventDraftAction, submitMemberEventAction} from "@/lib/events/member-actions";
import {loadMemberEventsContext} from "@/lib/events/member-core";

import {eventFormLabels} from "../labels";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>}>;

// The Portal layout already redirects an unauthenticated visitor to
// /member-login with a continuation, so `requireActor` cannot throw here.
export default async function NewMemberEventPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const t = await getTranslations({locale, namespace: "Portal.memberEvents"});
  // NO_MANAGED_COMPANY and MEMBERSHIP_INACTIVE both mean "nothing to publish from".
  const context = await loadMemberEventsContext(actor).catch(() => null);
  if (!context) {
    return <section className="glass-card space-y-3 p-6"><p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p><h1 className="font-serif text-4xl font-semibold">{t("newTitle")}</h1><p className="text-muted-foreground">{t("noCompany")}</p></section>;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("newTitle")}</h1>
        <p className="text-muted-foreground">{t("quota", {used: context.usedThisQuarter, limit: Number.isFinite(context.limit) ? String(context.limit) : t("unlimited")})}</p>
      </header>
      <EventForm canSubmit={context.canPublish} draftAction={saveMemberEventDraftAction.bind(null, locale)} labels={eventFormLabels(t)} submitAction={submitMemberEventAction.bind(null, locale)} values={null} />
    </div>
  );
}
