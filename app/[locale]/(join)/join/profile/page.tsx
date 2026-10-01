import {PolicyConfirmation} from "@/components/join/policy-confirmation";
import {getJoinDraft} from "@/lib/membership/join-draft";
import {getPolicyConfirmation} from "@/lib/membership/policy-view";
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {JoinForm} from "@/components/join/join-form";
import {JoinProgress} from "@/components/join/progress";
import type {AppLocale} from "@/i18n/routing";
import {brandedTitle, buildPageMetadata} from "@/lib/metadata";
import {getActor} from "@/lib/auth/actor";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

import {saveProfile} from "../actions";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>};
function value(input: string | string[] | undefined) { return typeof input === "string" ? input : undefined; }
function planCode(input: string | undefined): PlanCode | null { try { return getPlan(input).code; } catch { return null; } }

// Mid-flow, member-specific step: keep it out of search results.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/join/profile",
    title: brandedTitle(locale as AppLocale, t("profileTitle")),
    description: t("profileDescription"),
    index: false,
  });
}

export default async function ProfilePage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const plan = planCode(value(query.plan));
  if (!plan) redirect(localizedPath(locale, "/membership"));
  const actor = await getActor().catch(() => null);
  if (!actor) redirect(`${localizedPath(locale, "/join")}?plan=${plan}`);
  if(actor.kind!=="member")notFound();
  const draft=await getJoinDraft(actor,plan,value(query.application)??null);
  if(!draft)notFound();
  const t = await getTranslations("Join");
  const companyPlan = plan === "startup" || plan === "corporate";
  const labels = {plan: t("steps.plan"), auth: t("steps.auth"), profile: t("steps.profile"), company: t("steps.company")};
  const policyView = await getPolicyConfirmation(actor,value(query.application),locale);
  const action = saveProfile.bind(null, locale, plan, value(query.application) ?? null);

  return (
    <section className="glass-card p-6 sm:p-10">
      <JoinProgress active="profile" labels={labels} showCompany={companyPlan}/>
      <h1 className="font-serif text-4xl font-semibold">{t("profileTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("profileDescription")}</p>
      <div className="mt-8">
        <JoinForm action={action} fieldNames={["displayName", "phone", "jobTitle", "whatsappNumber"]} submitDisabled={!policyView.canProceed} pendingLabel={t("saving")} submitLabel={t("continue")}>
          <Field autoComplete="name" error="displayName-error" label={t("fields.displayName")} name="displayName" defaultValue={draft.profile?.displayName??""} required/>
          <Field autoComplete="tel" error="phone-error" label={t("fields.phone")} name="phone" defaultValue={draft.profile?.phone??""} type="tel"/>
          <Field autoComplete="organization-title" error="jobTitle-error" label={t("fields.jobTitle")} name="jobTitle" defaultValue={draft.profile?.jobTitle??""}/>
          <Field autoComplete="tel" error="whatsappNumber-error" label={t("fields.whatsappNumber")} name="whatsappNumber" defaultValue={draft.profile?.whatsappNumber??""} type="tel"/>
          <div className="rounded-md border border-border p-4 text-sm">
            <label className="flex items-start gap-3 font-medium" htmlFor="whatsappOptIn">
              <input className="mt-1" id="whatsappOptIn" name="whatsappOptIn" type="checkbox" defaultChecked={draft.profile?.whatsappOptIn===true}/>
              <span>{t("whatsapp.optIn")}</span>
            </label>
            <p className="mt-2 text-muted-foreground">{t("whatsapp.consent")} <span className="sr-only">{t("whatsapp.textVersion")}</span></p>
          </div>
          <PolicyConfirmation view={policyView} supportHref={localizedPath(locale,"/contact")} labels={{title:t("policy.title"),version:t("policy.version"),accept:t("policy.accept"),accepted:t("policy.accepted"),unavailable:t("policy.unavailable"),ownerRequired:t("policy.ownerRequired"),support:t("policy.support")}}/>
        </JoinForm>
      </div>
    </section>
  );
}

function Field({autoComplete, error, label, name, defaultValue = "", required = false, type = "text"}: {autoComplete: string; error: string; label: string; name: string; defaultValue?: string; required?: boolean; type?: string}) {
  return <div><label className="mb-2 block text-sm font-medium" htmlFor={name}>{label}</label><input aria-describedby={error} autoComplete={autoComplete} defaultValue={defaultValue} className="min-h-11 w-full rounded-md border border-input bg-background px-3" id={name} name={name} required={required} type={type}/></div>;
}
