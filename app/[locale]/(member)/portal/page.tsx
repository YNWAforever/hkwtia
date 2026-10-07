import type {ComponentProps} from "react";

import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {BenefitCards} from "@/components/portal/dashboard/benefit-cards";
import {MembershipGlance} from "@/components/portal/dashboard/membership-glance";
import {NextStep} from "@/components/portal/dashboard/next-step";
import {WelcomeBand} from "@/components/portal/dashboard/welcome-band";
import {PortalSignOutButton} from "@/components/portal/portal-sign-out-button";
import {HonestEmpty} from "@/components/wt/honest-empty";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {isAdminActor} from "@/lib/auth/authorize";
import {pickNextStep} from "@/lib/portal/next-step";
import {getDashboard, type DashboardViewModel} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function PortalPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  // The layout redirects unauthenticated visitors, but Next renders layout and
  // page in parallel, so requireActor() here threw UNAUTHORIZED into the
  // runtime error log on every anonymous hit (Vercel, 2026-09; audit F21).
  // Redirecting from the page as well keeps the log clean and the behaviour identical.
  const actor = await getActor();
  if (!actor) redirect(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent("/portal")}`);
  // Staff have no member dashboard: getDashboard's requireMember() would throw
  // FORBIDDEN into the error boundary. Same parallel-render reason as the
  // anonymous guard above, so this lives in the page as well as the layout.
  if (isAdminActor(actor)) redirect(localizedPath(locale, "/admin"));
  let dashboard: DashboardViewModel;
  try {
    dashboard = await getDashboard(actor);
  } catch (error) {
    if (!(error instanceof Error && error.message === "MEMBERSHIP_INACTIVE")) throw error;
    const t = await getTranslations({locale, namespace: "Portal"});
    return <div className="space-y-6">
      <HonestEmpty variant="inner" title={t("membershipUnavailableTitle")} copy={t("membershipUnavailableDescription")} />
      <div className="flex flex-wrap items-center gap-3">
        <PortalSignOutButton label={t("signOut")} errorLabel={t("signOutError")} />
        <a className="min-h-11 content-center underline underline-offset-4" href={localizedPath(locale, "/membership")}>
          {t("membershipOptions")}
        </a>
      </div>
    </div>;
  }
  const t = await getTranslations({locale, namespace: "Portal"});
  const {primaryStatus, onboarding, memberships, companies, profile} = dashboard;
  const membership = memberships[0];
  const step = pickNextStep(dashboard);

  // The step -> copy/href mapping lives here, not in NextStep: the component stays presentational
  // and the page owns which key and route each state resolves to.
  let nextStep: ComponentProps<typeof NextStep> | null = null;
  if (step) {
    const key = step.kind === "billing" ? step.reason : step.kind === "review" ? "pending_review" : step.step;
    const href = step.kind === "billing" ? "/portal/billing" : step.kind === "onboarding" ? `/portal/${step.step}` : null;
    nextStep = {
      label: t("nextStep.label"),
      title: t(`nextStep.${key}.title`),
      body: t(`nextStep.${key}.body`),
      ...(href ? {action: {href, label: t(`nextStep.${key}.action` as "nextStep.company.action")}} : {}),
      ...(step.kind === "onboarding" ? {progress: {
        summary: t("onboardingProgress", {completed: onboarding.completedSteps, total: onboarding.totalSteps}),
        steps: [
          {label: t("onboardingSteps.profile"), done: onboarding.profileComplete},
          {label: t("onboardingSteps.company"), done: onboarding.companyComplete},
        ],
      }} : {}),
    };
  }
  const planLabel = t(`plans.${membership.planCode}`);

  return (
    <div className="space-y-8">
      <WelcomeBand greeting={t("welcome", {name: profile.displayName})} companyName={companies[0]?.displayName} planLabel={planLabel} statusLabel={t(`status.${primaryStatus}.label`)} />
      {nextStep ? <NextStep {...nextStep} /> : null}
      <MembershipGlance
        locale={locale}
        planLabel={planLabel}
        periodEnd={membership.billingPeriodEnd}
        endsAtPeriodEnd={membership.cancelAtPeriodEnd}
        seatsValue={t("glance.seatsValue", {count: membership.seatLimit})}
        labels={{title: t("glance.title"), plan: t("glance.plan"), renews: t("glance.renews"), ends: t("glance.ends"), seats: t("glance.seats"), manageSeats: t("glance.manageSeats")}}
      />
      <BenefitCards
        title={t("benefits.title")}
        actionLabel={t("benefits.action")}
        items={[
          {href: "/portal/events", title: t("benefits.events.title"), copy: t("benefits.events.copy")},
          {href: "/portal/directory", title: t("benefits.directory.title"), copy: t("benefits.directory.copy")},
          {href: "/portal/tools", title: t("benefits.tools.title"), copy: t("benefits.tools.copy")},
        ]}
      />
    </div>
  );
}
