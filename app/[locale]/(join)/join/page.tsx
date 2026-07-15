import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {JoinForm} from "@/components/join/join-form";
import {JoinProgress} from "@/components/join/progress";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {destinationForJoin} from "@/lib/membership/join-navigation";
import {startJoin} from "@/lib/membership/join-service";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

import {requestMagicLink} from "./actions";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>};

function queryValue(value: string | string[] | undefined) { return typeof value === "string" ? value : undefined; }
function selectedPlan(value: string | undefined): PlanCode | null { try { return getPlan(value).code; } catch { return null; } }

export default async function JoinPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Join");
  const plan = selectedPlan(queryValue(query.plan));
  const labels = {plan: t("steps.plan"), auth: t("steps.auth"), profile: t("steps.profile"), company: t("steps.company")};

  if (!plan) return (
    <section className="glass-card p-6 sm:p-10">
      <h1 className="font-serif text-4xl font-semibold">{t("invalidPlanTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("invalidPlanDescription")}</p>
      <Link className="mt-6 inline-flex text-primary underline" href={localizedPath(locale, "/membership")}>{t("backToMembership")}</Link>
    </section>
  );

  const companyPlan = plan === "startup" || plan === "corporate";
  const actor = await getActor().catch(() => null);
  if (actor) {
    const application = await startJoin(actor, {plan, applicationId: queryValue(query.application) ?? null}).catch(() => notFound());
    const destination = destinationForJoin(locale, plan, application.applicationId, application.next);
    if (destination.kind === "page") redirect(destination.href!);
    const status = destination.next === "complete" || destination.next === "review" ? destination.next : "checkout";
    return (
      <section className="glass-card p-6 sm:p-10">
        <JoinProgress active={companyPlan ? "company" : "profile"} labels={labels} showCompany={companyPlan}/>
        <h1 className="font-serif text-4xl font-semibold">{t(`status.${status}.title`)}</h1>
        <p className="mt-4 text-muted-foreground">{t(`status.${status}.description`)}</p>
      </section>
    );
  }

  const action = requestMagicLink.bind(null, locale, plan);
  return (
    <section className="glass-card p-6 sm:p-10">
      <JoinProgress active="auth" labels={labels} showCompany={companyPlan}/>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t(`plans.${plan}`)}</p>
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
    </section>
  );
}
