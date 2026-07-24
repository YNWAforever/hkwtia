import {getTranslations, setRequestLocale} from "next-intl/server";
import {redirect} from "next/navigation";

import {JoinForm} from "@/components/join/join-form";
import {JoinProgress} from "@/components/join/progress";
import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {getPlan, type PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

import {saveCompany} from "../actions";

type Props = {params: Promise<{locale: string}>; searchParams: Promise<Record<string, string | string[] | undefined>>};
function value(input: string | string[] | undefined) { return typeof input === "string" ? input : undefined; }
function planCode(input: string | undefined): PlanCode | null { try { return getPlan(input).code; } catch { return null; } }

export default async function CompanyPage({params, searchParams}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  const query = await searchParams;
  setRequestLocale(locale);
  const plan = planCode(value(query.plan));
  const applicationId = value(query.application);
  if (!plan || !applicationId || (plan !== "startup" && plan !== "corporate")) redirect(localizedPath(locale, "/membership"));
  const actor = await getActor().catch(() => null);
  if (!actor) redirect(`${localizedPath(locale, "/join")}?plan=${plan}`);
  const t = await getTranslations("Join");
  const labels = {plan: t("steps.plan"), auth: t("steps.auth"), profile: t("steps.profile"), company: t("steps.company")};
  const action = saveCompany.bind(null, locale, plan, applicationId);

  return (
    <section className="glass-card p-6 sm:p-10">
      <JoinProgress active="company" labels={labels} showCompany/>
      <h1 className="font-serif text-4xl font-semibold">{t("companyTitle")}</h1>
      <p className="mt-4 text-muted-foreground">{t("companyDescription")}</p>
      <div className="mt-8">
        <JoinForm action={action} fieldNames={["legalName", "companyDisplayName", "website", "industry", "sizeBand", "description"]} pendingLabel={t("saving")} submitLabel={t("submitApplication")}>
          <Field autoComplete="organization" label={t("fields.legalName")} name="legalName" required/>
          <Field autoComplete="organization" label={t("fields.companyDisplayName")} name="companyDisplayName" required/>
          <Field autoComplete="url" label={t("fields.website")} name="website" type="url"/>
          <Field label={t("fields.industry")} name="industry"/>
          <Field label={t("fields.sizeBand")} name="sizeBand"/>
          <div><label className="mb-2 block text-sm font-medium" htmlFor="description">{t("fields.description")}</label><textarea aria-describedby="description-error" className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2" id="description" name="description"/></div>
        </JoinForm>
      </div>
    </section>
  );
}

function Field({autoComplete, label, name, required = false, type = "text"}: {autoComplete?: string; label: string; name: string; required?: boolean; type?: string}) {
  return <div><label className="mb-2 block text-sm font-medium" htmlFor={name}>{label}</label><input aria-describedby={`${name}-error`} autoComplete={autoComplete} className="min-h-11 w-full rounded-md border border-input bg-background px-3" id={name} name={name} required={required} type={type}/></div>;
}
