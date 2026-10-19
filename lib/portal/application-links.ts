import type {AppLocale} from "@/i18n/routing";
import type {MemberApplicationView} from "@/lib/portal/applications";
import {localizedPath} from "@/lib/urls";

export function memberApplicationDetailHref(locale: AppLocale, id: string): string {
  return localizedPath(locale, `/portal/applications/${encodeURIComponent(id)}`);
}

export function memberApplicationActionHref(
  locale: AppLocale,
  application: MemberApplicationView,
): string | null {
  switch (application.nextAction) {
    case "resume": {
      const query = new URLSearchParams({plan: application.planCode, application: application.id});
      return `${localizedPath(locale, "/join")}?${query.toString()}`;
    }
    case "billing":
      return localizedPath(locale, "/portal/billing");
    case "new": {
      const query = new URLSearchParams({plan: application.planCode});
      return `${localizedPath(locale, "/join")}?${query.toString()}`;
    }
    case "wait":
    case "complete":
      return null;
  }
}
