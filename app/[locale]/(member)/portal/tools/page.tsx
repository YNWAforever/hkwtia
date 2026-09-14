import Link from "next/link";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MEMBER_TOOLS} from "@/config/member-tools";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {isToolAvailable} from "@/lib/portal/member-tools";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function PortalToolsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const [dashboard, t] = await Promise.all([
    getDashboard(actor),
    getTranslations({locale, namespace: "Portal"}),
  ]);
  const plans = dashboard.memberships.map((membership) => membership.planCode);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{t("tools.eyebrow")}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{t("tools.title")}</h1>
        <p className="text-lg text-muted-foreground">{t("tools.description")}</p>
      </header>
      <ul className="grid gap-4 md:grid-cols-2">
        {MEMBER_TOOLS.map((tool) => {
          const available = isToolAvailable(tool, plans);
          return (
            <li className="glass-card flex flex-col gap-3 p-5" key={tool.key}>
              <h2 className="font-serif text-2xl font-semibold">{t(tool.titleKey)}</h2>
              {available ? (
                <Link className="inline-flex min-h-11 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={localizedPath(locale, `/portal/tools/${tool.key}`)}>
                  {t("tools.open")}
                </Link>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">{t("tools.lockedTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("tools.lockedDescription")}</p>
                  <Link className="text-link" href={localizedPath(locale, "/membership")}>{t("tools.upgrade")}</Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
