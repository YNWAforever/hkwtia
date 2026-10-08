import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {PortalPageHeader} from "@/components/portal/page-header";
import {getTranslations, setRequestLocale} from "next-intl/server";

import {MEMBER_TOOLS} from "@/config/member-tools";
import type {AppLocale} from "@/i18n/routing";
import {portalPageActor} from "@/lib/portal/page-actor";
import {isToolAvailable, toolPlanList} from "@/lib/portal/member-tools";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export default async function PortalToolsPage({params}: Props) {
  const {locale: localeValue} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await portalPageActor(locale, "/portal/tools");
  const [dashboard, t] = await Promise.all([
    getDashboard(actor),
    getTranslations({locale, namespace: "Portal"}),
  ]);

  return (
    <div className="portal-tools">
      <PortalPageHeader eyebrow={t("navGroups.benefits")} lead={t("tools.description")} title={t("tools.title")} />
      <ul className="portal-card-grid">
        {MEMBER_TOOLS.map((tool) => {
          const available = isToolAvailable(tool, dashboard.memberships);
          return (
            <li className="portal-card portal-tool-card" key={tool.key}>
              <h2>{t(tool.titleKey)}</h2>
              <p>{t(tool.descriptionKey)}</p>
              {available ? (
                <Link className="button" href={localizedPath(locale, `/portal/tools/${tool.key}`)}>
                  {t("tools.open")}
                </Link>
              ) : (
                <>
                  <p className="portal-tool-locked">{t("tools.includedWith", {plans: toolPlanList(tool, locale, (plan) => t(`plans.${plan}`))})}</p>
                  <Link className="portal-button-outline" href={localizedPath(locale, "/membership")}>{t("tools.viewPlans")}</Link>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
