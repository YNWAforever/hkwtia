import "server-only";

import {getTranslations} from "next-intl/server";

import {PrivateLink} from "@/components/internal-shell/private-link";
import {PortalPageHeader} from "@/components/portal/page-header";
import type {AppLocale} from "@/i18n/routing";
import type {PortalRecoveryState} from "@/lib/portal/access-state";
import {localizedPath} from "@/lib/urls";

/** Called by the server page after its protected read has denied access. */
export async function portalAccessNotice(locale: AppLocale, access: PortalRecoveryState) {
  const t = await getTranslations({locale, namespace: "Portal"});
  const primary = access.status === "needs_payment" ? "billing" : access.status === "under_review" ? "profile" : "membership";
  const links = {
    billing: {href: "/portal/billing", label: t("billing.title")},
    profile: {href: "/portal/profile", label: t("profile")},
    membership: {href: "/membership", label: t("membershipOptions")},
  };
  const actions = [primary, ...(["profile", "billing", "membership"] as const).filter((key) => key !== primary)] as const;
  return <div className="space-y-6">
    <PortalPageHeader eyebrow={t("shell.portalLabel")} title={t(`access.${access.status}.title`)} lead={t(`access.${access.status}.body`)} />
    <div className="flex flex-wrap gap-3">
      {actions.map((key, index) => <PrivateLink key={key} className={index === 0 ? "button" : "portal-button-outline"} href={localizedPath(locale, links[key].href)}>{links[key].label}</PrivateLink>)}
    </div>
  </div>;
}
