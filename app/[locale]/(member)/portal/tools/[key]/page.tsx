import {PrivateLink as Link} from "@/components/internal-shell/private-link";
import {HonestEmpty} from "@/components/wt/honest-empty";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {MEMBER_TOOLS} from "@/config/member-tools";
import type {AppLocale} from "@/i18n/routing";
import {requireActor} from "@/lib/auth/actor";
import {memberToolsEnv} from "@/lib/config/env";
import {isToolAvailable, toolFrameSrc, toolPlanList} from "@/lib/portal/member-tools";
import {getDashboard} from "@/lib/portal/queries";
import {localizedPath} from "@/lib/urls";

export const dynamic = "force-dynamic";

type Props = Readonly<{params: Promise<{locale: string; key: string}>}>;

export default async function PortalToolPage({params}: Props) {
  const {locale: localeValue, key} = await params;
  const locale = localeValue as AppLocale;
  setRequestLocale(locale);
  const actor = await requireActor();
  const tool = MEMBER_TOOLS.find((candidate) => candidate.key === key);
  if (!tool) notFound();
  const [dashboard, t] = await Promise.all([
    getDashboard(actor),
    getTranslations({locale, namespace: "Portal"}),
  ]);
  const available = isToolAvailable(tool, dashboard.memberships);

  const header = (
    <header className="portal-tool-head">
      <Link className="text-link" href={localizedPath(locale, "/portal/tools")}>{t("tools.back")}</Link>
      <h1>{t(tool.titleKey)}</h1>
    </header>
  );

  if (!available) {
    return (
      <div className="portal-tool">
        {header}
        <HonestEmpty
          actions={[{href: "/membership", label: t("tools.viewPlans")}]}
          copy={t("tools.includedWith", {plans: toolPlanList(tool, locale, (plan) => t(`plans.${plan}`))})}
          title={t("tools.lockedTitle")}
          variant="inner"
        />
      </div>
    );
  }

  // Fail closed rather than embed a tool we cannot authenticate: a frame that loads the
  // tool's 401 is worse than saying so, and a missing token must not 500 the portal.
  const token = memberToolsEnv()[tool.tokenField];
  if (!token) {
    return (
      <div className="portal-tool">
        {header}
        <HonestEmpty copy={t("tools.unavailableDescription")} title={t("tools.unavailableTitle")} variant="inner" />
      </div>
    );
  }

  // No `sandbox`: the framed document is cross-origin, so the browser already isolates it
  // from our origin and DOM. A sandbox without `allow-same-origin` would give it an opaque
  // origin and stop it sending its SameSite=None; Partitioned auth cookie, and with it the
  // attribute is all but a no-op for a cross-origin frame. `referrerPolicy="no-referrer"`
  // keeps the token-bearing URL out of the Referer.
  return (
    <div className="portal-tool">
      {header}
      <iframe
        className="portal-tool-frame"
        referrerPolicy="no-referrer"
        src={toolFrameSrc(tool, token)}
        title={t(tool.titleKey)}
      />
    </div>
  );
}
