import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {updateCompanyAction} from "@/lib/portal/commands";
import {getDashboard} from "@/lib/portal/queries";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function CompanyPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const dashboard = await getDashboard(actor);
  const t = await getTranslations({locale, namespace: "Portal"});
  const company = dashboard.companies[0];

  if (!company) {
    return (
      <section className="glass-card space-y-3 p-6 sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("company")}</p>
        <h1 className="font-serif text-4xl font-semibold">{t("companyTitle")}</h1>
        <p className="text-muted-foreground">{t("companyEmpty")}</p>
      </section>
    );
  }

  const canManage = company.canManage;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("company")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("companyTitle")}</h1>
        <p className="text-muted-foreground">{t("companyDescription")}</p>
      </header>
      <form action={canManage ? updateCompanyAction : undefined} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
        <input name="companyId" type="hidden" value={company.id} />
        <label className="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("fields.legalName")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" defaultValue={company.legalName} disabled={!canManage} name="legalName" required />
        </label>
        <label className="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("fields.displayName")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" defaultValue={company.displayName} disabled={!canManage} name="displayName" required />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>{t("fields.website")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" defaultValue={company.website ?? ""} disabled={!canManage} name="website" type="url" />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>{t("fields.industry")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" defaultValue={company.industry ?? ""} disabled={!canManage} name="industry" />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>{t("fields.sizeBand")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3 disabled:opacity-60" defaultValue={company.sizeBand ?? ""} disabled={!canManage} name="sizeBand" />
        </label>
        <label className="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("fields.description")}</span>
          <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 disabled:opacity-60" defaultValue={company.description ?? ""} disabled={!canManage} name="description" />
        </label>
        {canManage ? <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:col-span-2 sm:justify-self-start" type="submit">{t("save")}</button> : <p className="text-sm text-muted-foreground sm:col-span-2">{t("readOnly")}</p>}
      </form>
    </div>
  );
}
