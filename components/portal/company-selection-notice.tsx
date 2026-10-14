import "server-only";
import {getTranslations} from "next-intl/server";
import {CompanySelector} from "@/components/portal/company-selector";
import {PortalPageHeader} from "@/components/portal/page-header";
import {PrivateLink} from "@/components/internal-shell/private-link";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

export async function companySelectionNotice(locale: AppLocale, companies: readonly {id: string; displayName: string}[], path: string) {
  const t = await getTranslations({locale, namespace: "Portal"});
  return <div>
    <PortalPageHeader title={t("companySelection.unavailableTitle")} lead={t("companySelection.unavailableBody")} />
    {companies.length > 0 ? <CompanySelector action={localizedPath(locale, path)} companyId="" choices={companies} labels={{choose: t("companySelection.choose"), use: t("companySelection.use"), changeWarning: t("companySelection.changeWarning")}} /> : null}
    <PrivateLink className="text-link" href={localizedPath(locale, "/portal")}>{t("dashboard")}</PrivateLink>
  </div>;
}
