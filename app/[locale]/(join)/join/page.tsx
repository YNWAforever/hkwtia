import type {Metadata} from "next";
import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {JoinForm} from "@/components/join/join-form";
import {JoinProgress} from "@/components/join/progress";
import {StructuredData} from "@/components/seo/structured-data";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {parseJoinContinuation} from "@/lib/membership/join-navigation";
import {buildPageMetadata} from "@/lib/metadata";
import {applicationsRepository} from "@/lib/db/repos/applications";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {routeBreadcrumbItems} from "@/lib/seo/route-breadcrumbs";
import {buildBreadcrumbData} from "@/lib/structured-data";
import {localizedPath} from "@/lib/urls";
import {planChooserItems} from "@/lib/membership/join-plan-chooser";

import {requestMagicLink, resumeJoinAction} from "./actions";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>};

function queryValue(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function selectedPlan(value: string | undefined): PlanCode | null { try { return getPlan(value).code; } catch { return null; } }

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/join",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function JoinPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Join");
  // Unscoped: the breadcrumb label keys are fully qualified (`Common.breadcrumbJoin`).
  const tRoot = await getTranslations({locale});
  // Five states render below -- chooser, invalid plan, two magic-link forms and the signed-in
  // status -- but every one is /join at the same canonical URL, so each carries the same trail.
  const trail = <StructuredData data={buildBreadcrumbData(routeBreadcrumbItems(locale, "/join", tRoot))} />;
  const plan = selectedPlan(queryValue(query.plan));
  const continuation = parseJoinContinuation(queryValue(query.next), locale);
  const labels = {plan: t("steps.plan"), auth: t("steps.auth"), profile: t("steps.profile"), company: t("steps.company")};

  const actor = await getActor().catch(() => null);
  if (actor && continuation) redirect(localizedPath(locale, continuation));

  if (!plan && !continuation) {
    // A malformed ?plan= still gets the old "unavailable" message; a bare /join
    // gets the chooser, because that is where every "Join WiseTech" CTA lands.
    if (queryValue(query.plan) !== undefined) return (
      <section className="glass-card p-6 sm:p-10">
        <h1 className="font-serif text-4xl font-semibold">{t("invalidPlanTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("invalidPlanDescription")}</p>
        <Link className="mt-6 inline-flex text-primary underline" href={localizedPath(locale, "/membership")}>{t("backToMembership")}</Link>
        {trail}
      </section>
    );
    return (
      <section className="glass-card p-6 sm:p-10">
        <JoinProgress active="plan" labels={labels} showCompany={false}/>
        <h1 className="mt-3 font-serif text-4xl font-semibold">{t("choosePlanTitle")}</h1>
        <p className="mt-4 text-muted-foreground">{t("choosePlanDescription")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {planChooserItems(locale).map((item) => (
            <li className="rounded-lg border border-border p-5" key={item.code}>
              <h2 className="font-serif text-2xl font-semibold">{t(`plans.${item.code}`)}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t(`choosePlan.${item.code}`)}</p>
              <Link className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={item.href}>
                {item.kind === "join" ? t("choosePlanAction", {plan: t(`plans.${item.code}`)}) : t("choosePlanContact")}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="mt-6 inline-flex text-primary underline" href={localizedPath(locale, "/membership")}>{t("choosePlanCompare")}</Link>
        {trail}
      </section>
    );
  }

  if (!plan) {
    const action = requestMagicLink.bind(null, locale, null, continuation);
    return (
      <section className="glass-card p-6 sm:p-10">
        <JoinProgress active="auth" labels={labels} showCompany={false}/>
        <h1 className="mt-3 font-serif text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-4 text-muted-foreground">{queryValue(query.sent) ? t("magicLinkSent") : t("authDescription")}</p>
        <div className="mt-8">
          <JoinForm action={action} fieldNames={["email"]} pendingLabel={t("sending")} submitLabel={t("sendMagicLink")}>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="email">{t("fields.email")}</label>
              <input aria-describedby="email-error" autoComplete="email" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="email" name="email" required type="email"/>
            </div>
          </JoinForm>
        </div>
        {trail}
      </section>
    );
  }

  const companyPlan = plan === "startup" || plan === "corporate";
  if (actor) {
    if (actor.kind !== "member") notFound();
    const applications = await applicationsRepository.listOwned(actor, plan);
    const requestedId = queryValue(query.application);
    if (requestedId && !applications.some((application) => application.id === requestedId)) notFound();
    const resumable = applications.filter((application) => ["draft", "pending_payment", "pending_review"].includes(application.status));
    return (
      <section className="glass-card p-6 sm:p-10">
        <JoinProgress active={companyPlan ? "company" : "profile"} labels={labels} showCompany={companyPlan}/>
        <p className="text-sm font-medium text-primary">{t(`plans.${plan}`)}</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold">{t("resume.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("resume.description")}</p>
        {queryValue(query.error) === "status" && <p className="mt-4 text-destructive" role="alert">{t("resume.statusUnavailable")}</p>}
        {resumable.length > 0 && <ul className="mt-6 space-y-3">
          {resumable.map((application) => (
            <li className="rounded-lg border border-border p-4" key={application.id}>
              <p className="font-medium">{t(`resume.steps.${application.status === "pending_payment" ? "checkout" : application.status === "pending_review" ? "review" : application.currentStep}`)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("resume.lastSaved", {date: new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Hong_Kong"}).format(application.updatedAt)})}</p>
              <form action={resumeJoinAction} className="mt-3">
                <input name="locale" type="hidden" value={locale}/><input name="plan" type="hidden" value={plan}/><input name="applicationId" type="hidden" value={application.id}/>
                <button className="min-h-11 rounded-md bg-primary px-5 text-primary-foreground" type="submit">{t("resume.continue")}</button>
              </form>
            </li>
          ))}
        </ul>}
        <form action={resumeJoinAction} className="mt-6">
          <input name="locale" type="hidden" value={locale}/><input name="plan" type="hidden" value={plan}/>
          {resumable.length > 0 && <input name="intent" type="hidden" value="new"/>}
          <button className="min-h-11 rounded-md border border-primary px-5 text-primary" type="submit">{t(resumable.length > 0 ? "resume.new" : "resume.start")}</button>
        </form>
        {applications.some((application) => application.status === "completed") && <Link className="mt-5 inline-block text-primary underline" href={localizedPath(locale, "/portal")}>{t("resume.account")}</Link>}
        {trail}
      </section>
    );
  }

  const action = requestMagicLink.bind(null, locale, plan, continuation);
  return (
    <section className="glass-card p-6 sm:p-10">
      <JoinProgress active="auth" labels={labels} showCompany={companyPlan}/>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t(`plans.${plan}`)}</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-4 text-muted-foreground">{queryValue(query.sent) ? t("magicLinkSent") : t("authDescription")}</p>
      <div className="mt-8">
        <JoinForm action={action} fieldNames={["email"]} pendingLabel={t("sending")} submitLabel={t("sendMagicLink")}>
          {plan && queryValue(query.application) && <input name="application" type="hidden" value={queryValue(query.application)}/>}
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="email">{t("fields.email")}</label>
            <input aria-describedby="email-error" autoComplete="email" className="min-h-11 w-full rounded-md border border-input bg-background px-3" id="email" name="email" required type="email"/>
          </div>
        </JoinForm>
      </div>
      {trail}
    </section>
  );
}
