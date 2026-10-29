import {OnboardingChecklist} from "@/components/portal/onboarding-checklist";
import {renewalPathForStatus} from "@/config/membership-journey";
import {deriveOnboardingChecklist} from "@/lib/portal/onboarding-checklist";
import {PrivateLink} from "@/components/internal-shell/private-link";
import type {ComponentProps} from "react";

import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {FirstResult, type FirstMemberResult} from "@/components/portal/dashboard/first-result";
import {recordFirstResultReadFailure} from "@/lib/portal/first-result-diagnostic";
import {classifyPortalAccess} from "@/lib/portal/access-state";
import {getMemberEventPage, searchDirectory} from "@/lib/portal/content";
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
import {getMembershipIssues} from "@/lib/portal/membership-selection";
import {getDashboard, type DashboardViewModel} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";
import {ticketPurchaseAudience} from "@/lib/tickets/eligibility";

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
      {/* HonestEmpty's inner variant renders an h3, so without this the page would have no h1. */}
      <h1 className="sr-only">{t("dashboard")}</h1>
      <HonestEmpty variant="inner" title={t("membershipUnavailableTitle")} copy={t("membershipUnavailableDescription")} />
      <div className="flex flex-wrap items-center gap-3">
        <PrivateLink className="portal-button-outline" href={localizedPath(locale, "/portal/applications")}>{t("applications.nav")}</PrivateLink>
        <PrivateLink className="portal-button-outline" href={localizedPath(locale, "/portal/profile")}>{t("profile")}</PrivateLink>
        <PrivateLink className="portal-button-outline" href={localizedPath(locale, "/portal/billing")}>{t("renew.action")}</PrivateLink>
        <PrivateLink className="portal-button-outline" href={localizedPath(locale, "/join")}>{t("renew.rejoin")}</PrivateLink>
        <PortalSignOutButton label={t("signOut")} errorLabel={t("signOutError")} />
        <a className="min-h-11 content-center underline underline-offset-4" href={localizedPath(locale, "/membership")}>
          {t("membershipOptions")}
        </a>
      </div>
    </div>;
  }
  const t = await getTranslations({locale, namespace: "Portal"});
  const {primaryStatus, primaryMembership: membership, onboarding, companies, profile} = dashboard;
  const company = companies.find((row) => row.id === membership.companyId);
  const issues = getMembershipIssues(dashboard.memberships);
  const issueContext = (issue: (typeof issues)[number]) => [
    companies.find((row) => row.id === issue.companyId)?.displayName,
    t(`plans.${issue.planCode}`),
  ].filter(Boolean).join(" · ");
  const step = pickNextStep(dashboard);

  // The step -> copy/href mapping lives here, not in NextStep: the component stays presentational
  // and the page owns which key and route each state resolves to.
  let nextStep: ComponentProps<typeof NextStep> | null = null;
  if (step) {
    const key = step.kind === "billing" ? step.reason : step.kind === "review" ? "pending_review" : step.step;
    const href = step.kind === "billing" ? "/portal/billing"
      : step.kind === "onboarding" ? `/portal/${step.step}`
      : step.kind === "review" ? "/portal/applications"
      : null;
    nextStep = {
      label: t("nextStep.label"),
      title: t(`nextStep.${key}.title`),
      body: t(`nextStep.${key}.body`),
      ...(issues[0] ? {context: issueContext(issues[0])} : {}),
      ...(issues.length > 1 ? {additional: {
        label: t("nextStep.otherMemberships"),
        items: issues.slice(1).map((issue) => ({
          id: issue.id, context: issueContext(issue), title: t(`nextStep.${issue.status}.title`),
        })),
      }} : {}),
      // The cast is sound: href is non-null exactly for the billing and onboarding keys, and each
      // of those has an `action` string; pending_review has neither, so it never reaches t() here.
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
  let firstResult: FirstMemberResult | null = null;
  if (!step && classifyPortalAccess(dashboard.memberships).status === "ready") {
    try {
      const event = (await getMemberEventPage(actor, {limit: 1}, undefined, locale)).items[0];
      if (event) {
        const legacyCopy = "namespace" in event ? await getTranslations({locale, namespace: event.namespace}) : null;
        firstResult = {
          kind: "event",
          title: "title" in event ? event.title : legacyCopy!("title"),
          description: "description" in event ? event.description : "",
          startsAt: event.startsAt, venue: event.venue,
          href: "namespace" in event ? `/events/${encodeURIComponent(event.slug)}`
            : event.registrationMode !== "ticketed" ? `/portal/events#event-${event.id}`
            : ticketPurchaseAudience(event) === "public" ? `/events/${encodeURIComponent(event.slug)}`
            : `/portal/events/${event.id}`,
        };
      } else {
        const member = (await searchDirectory(actor, {limit: 1, excludeSelf: true})).items[0];
        firstResult = member ? {
          kind: "member", name: member.displayName, jobTitle: member.jobTitle, company: member.companyDisplayName,
          href: `/portal/directory?${new URLSearchParams({q: member.displayName})}`,
        } : {kind: "empty"};
      }
    } catch (error) {
      firstResult = {kind: "unavailable", reference: recordFirstResultReadFailure(error)};
    }
  }

  return (
    <div className="space-y-8">
      <WelcomeBand greeting={t("welcome", {name: profile.displayName})} companyName={company?.displayName} planLabel={planLabel} statusLabel={t(`status.${primaryStatus}.label`)} />
      {nextStep ? <NextStep {...nextStep} /> : null}
      {firstResult ? <FirstResult result={firstResult} locale={locale} labels={{
        title: t("firstResult.title"), event: t("firstResult.event"), member: t("firstResult.member"),
        viewEvent: t("firstResult.viewEvent"), viewMember: t("firstResult.viewMember"),
        empty: t("firstResult.empty"), unavailable: t("firstResult.unavailable", {reference: firstResult.kind === "unavailable" ? firstResult.reference : ""}),
        browseEvents: t("firstResult.browseEvents"), retry: t("firstResult.retry"),
      }}/> : null}
      {renewalPathForStatus(primaryStatus) ? <PrivateLink className="portal-button-outline" href={localizedPath(locale, "/portal/billing")}>{t("renew.action")}</PrivateLink> : null}
      <OnboardingChecklist
        items={deriveOnboardingChecklist({profileComplete: onboarding.profileComplete, whatsappOptIn: profile.whatsappOptIn, planCode: membership.planCode})}
        labels={{
          title: t("checklist.title"),
          lead: t("checklist.lead"),
          kitsTitle: t("checklist.kitsTitle"),
          kitsLead: t("checklist.kitsLead"),
          done: t("checklist.done"),
          todo: t("checklist.todo"),
          items: {
            profile: t("checklist.profile"),
            welcomeKit: t("checklist.welcomeKit"),
            associationKit: t("checklist.associationKit"),
            whatsapp: t("checklist.whatsapp"),
            firstEvent: t("checklist.firstEvent"),
            registration: t("checklist.registration"),
          },
          welcomeKit: t("checklist.welcomeKit"),
          associationKit: t("checklist.associationKit"),
          whatsappCommunity: t("checklist.whatsappCommunity"),
        }}
        locale={locale}
      />
      <MembershipGlance
        locale={locale}
        companyId={membership.companyId}
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
