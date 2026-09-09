import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {EventForm} from "@/components/portal/event-form";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {saveMemberEventAction} from "@/lib/events/member-actions";
import {loadMemberEventsContext} from "@/lib/events/member-core";
import {localizedPath} from "@/lib/urls";

import {eventFormLabels} from "../labels";

export const dynamic = "force-dynamic";
type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function NewMemberEventPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout redirects anonymous visitors too, but Next renders layout and
  // page in parallel, so a page-level requireActor() would throw UNAUTHORIZED
  // into the runtime log on every anonymous hit (audit F21). Redirect here as
  // well; the continuation allowlist (lib/portal/continuation.ts) accepts this
  // deep path, so sign-in returns to it rather than to /portal/events.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent("/portal/events/new")}`);
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
      <EventForm action={saveMemberEventAction.bind(null, locale)} canSubmit={context.canPublish} labels={eventFormLabels(t)} values={null} />
    </div>
  );
}
