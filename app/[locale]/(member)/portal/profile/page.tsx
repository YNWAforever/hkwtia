import {getTranslations, setRequestLocale} from "next-intl/server";

import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {getDashboard} from "@/lib/portal/queries";
import {updateProfileAction} from "@/lib/portal/commands";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function ProfilePage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const dashboard = await getDashboard(actor);
  const t = await getTranslations({locale, namespace: "Portal"});
  const profile = dashboard.profile;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("profile")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">{t("profileTitle")}</h1>
        <p className="text-muted-foreground">{t("profileDescription")}</p>
      </header>
      <form action={updateProfileAction} className="glass-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
        <label className="space-y-2 text-sm font-medium sm:col-span-2">
          <span>{t("fields.displayName")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={profile.displayName} name="displayName" required />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>{t("fields.phone")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={profile.phone ?? ""} name="phone" type="tel" />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>{t("fields.jobTitle")}</span>
          <input className="min-h-11 w-full rounded-md border border-input bg-background px-3" defaultValue={profile.jobTitle ?? ""} name="jobTitle" />
        </label>
        <input name="locale" type="hidden" value={locale} />
        <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
          <input defaultChecked={profile.directoryVisible} name="directoryVisible" type="checkbox" />
          <span>{t("fields.directoryVisible")}</span>
        </label>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:col-span-2 sm:justify-self-start" type="submit">{t("save")}</button>
      </form>
    </div>
  );
}
