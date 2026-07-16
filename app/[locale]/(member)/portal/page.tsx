import {getTranslations, setRequestLocale} from "next-intl/server";

import {StatusCard} from "@/components/portal/status-card";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {getDashboard} from "@/lib/portal/queries";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function PortalPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const dashboard = await getDashboard(actor);
  const t = await getTranslations({locale, namespace: "Portal"});
  const status = dashboard.primaryStatus;
  const action = dashboard.onboarding.nextAction;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("membershipStatus")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("dashboardTitle")}</h1>
        <p className="text-lg text-muted-foreground">{t("welcome", {name: dashboard.profile.displayName})}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <StatusCard status={status} title={t(`status.${status}.title`)} description={t(`status.${status}.description`)} />
        <section className="glass-card p-5">
          <p className="text-sm font-medium text-muted-foreground">{t("membershipPlan", {plan: dashboard.memberships[0].planCode})}</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">{t("onboarding")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("onboardingProgress", {completed: dashboard.onboarding.completedSteps, total: dashboard.onboarding.totalSteps})}</p>
          <p className="mt-4 text-sm font-medium">{t("nextAction")}: {t(`actions.${action}`)}</p>
        </section>
      </div>

      <section className="glass-card p-5 sm:p-7">
        <h2 className="font-serif text-2xl font-semibold">{t("profileTitle")}</h2>
        <p className="mt-2 text-muted-foreground">{t("profileDescription")}</p>
      </section>
    </div>
  );
}
