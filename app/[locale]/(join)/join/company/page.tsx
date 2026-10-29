import {PolicyConfirmation} from "@/components/join/policy-confirmation";
import {getJoinDraft} from "@/lib/membership/join-draft";
import {inviteDefaults} from "@/lib/membership/join-invite-attribution";
import {getPolicyConfirmation} from "@/lib/membership/policy-view";
import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound, redirect} from "next/navigation";

import {JoinForm} from "@/components/join/join-form";
import {JoinProgress} from "@/components/join/progress";
import type {AppLocale} from "@/i18n/routing";
import {brandedTitle, buildPageMetadata} from "@/lib/metadata";
import {getActor} from "@/lib/auth/actor";
import {planCollectsCompany} from "@/config/membership-journey";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

import {saveCompany} from "../actions";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>};
function value(input: string | string[] | undefined) { return typeof input === "string" ? input : undefined; }
function planCode(input: string | undefined): PlanCode | null { try { return getPlan(input).code; } catch { return null; } }

// Mid-flow, member-specific step: keep it out of search results.
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  const t = await getTranslations({locale, namespace: "Join"});
  return buildPageMetadata({
    locale: locale as AppLocale,
    pathname: "/join/company",
    title: brandedTitle(locale as AppLocale, t("companyTitle")),
    description: t("companyDescription"),
    index: false,
  });
}

export default async function CompanyPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const plan = planCode(value(query.plan));
  const applicationId = value(query.application);
  if (!plan || !applicationId || !planCollectsCompany(plan)) redirect(localizedPath(locale, "/membership"));
  const actor = await getActor().catch(() => null);
  if (!actor) redirect(`${localizedPath(locale, "/join")}?plan=${plan}`);
  if(actor.kind!=="member")notFound();
  const draft=await getJoinDraft(actor,plan,applicationId);
  if(!draft)notFound();
  const defaults = await inviteDefaults();
  const t = await getTranslations("Join");
  const labels = {plan: t("steps.plan"), auth: t("steps.auth"), profile: t("steps.profile"), company: t("steps.company")};
  const policyView = await getPolicyConfirmation(actor,applicationId,locale);
  const action = saveCompany.bind(null, locale, plan, applicationId);
  const fieldNames = ["legalName", "companyDisplayName", "website", "industry", "sizeBand", "description"];
  const legalName = draft.company?.legalName ?? defaults.legalName ?? "";
  const displayName = draft.company?.displayName ?? defaults.companyDisplayName ?? "";
  // Existing presentation names need confirmation even when they originally matched the legal name.
  const showOptional = Boolean(displayName || draft.company?.website ||
    draft.company?.industry || draft.company?.sizeBand || draft.company?.description);

  return (
    <section className="glass-card p-6 sm:p-10">
      <JoinProgress active="company" labels={labels} showCompany/>
      <h1 className="font-serif text-4xl font-semibold">{t("companyTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("companyDescription")}</p>
      <div className="mt-8">
        <JoinForm action={action} fieldNames={fieldNames} submitDisabled={!policyView.canProceed} pendingLabel={t("saving")} submitLabel={t("submitApplication")}>
          <Field autoComplete="organization" label={t("fields.legalName")} name="legalName" defaultValue={legalName} required/>
          <details className="rounded-md border border-border p-4" open={showOptional}>
            <summary className="min-h-11 cursor-pointer content-center font-medium">{t("optionalCompanyTitle")}</summary>
            <p className="mb-5 text-sm text-muted-foreground">{t("optionalCompanyHint")}</p>
            <div className="space-y-5">
              <Field autoComplete="organization" label={t("fields.companyDisplayName")} name="companyDisplayName" defaultValue={displayName}/>
              <p className="text-sm text-muted-foreground">{t("companyDisplayNameHint")}</p>
              <Field autoComplete="url" label={t("fields.website")} name="website" defaultValue={draft.company?.website??""} type="url"/>
              <Field label={t("fields.industry")} name="industry" defaultValue={draft.company?.industry??""}/>
              <Field label={t("fields.sizeBand")} name="sizeBand" defaultValue={draft.company?.sizeBand??""}/>
              <div><label className="mb-2 block text-sm font-medium" htmlFor="description">{t("fields.description")}</label><textarea aria-describedby="description-error" className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2" id="description" name="description" defaultValue={draft.company?.description??""}/></div>
            </div>
          </details>
          <PolicyConfirmation view={policyView} supportHref={localizedPath(locale,"/contact")} labels={{title:t("policy.title"),version:t("policy.version"),accept:t("policy.accept"),accepted:t("policy.accepted"),unavailable:t("policy.unavailable"),ownerRequired:t("policy.ownerRequired"),support:t("policy.support")}}/>
        </JoinForm>
      </div>
    </section>
  );
}

function Field({autoComplete, label, name, defaultValue = "", required = false, type = "text"}: {autoComplete?: string; label: string; name: string; defaultValue?: string; required?: boolean; type?: string}) {
  return <div><label className="mb-2 block text-sm font-medium" htmlFor={name}>{label}</label><input aria-describedby={`${name}-error`} autoComplete={autoComplete} defaultValue={defaultValue} className="min-h-11 w-full rounded-md border border-input bg-background px-3" id={name} name={name} required={required} type={type}/></div>;
}
