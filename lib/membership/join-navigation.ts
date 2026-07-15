import type {AppLocale} from "@/i18n/routing";
import type {JoinStep} from "@/lib/membership/onboarding";
import type {PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

export type JoinDestination = Readonly<{
  kind: "page" | "status";
  next: JoinStep;
  href: string | null;
}>;

export function destinationForJoin(locale: AppLocale, plan: PlanCode, applicationId: string, next: JoinStep): JoinDestination {
  if (next === "profile" || next === "company") {
    const search = new URLSearchParams({plan, application: applicationId});
    return {
      kind: "page",
      next,
      href: `${localizedPath(locale, `/join/${next}`)}?${search}`,
    };
  }
  return {kind: "status", next, href: null};
}

export function buildJoinCallback(appUrl: string, locale: AppLocale, plan: PlanCode): string {
  let base: URL;
  try {
    base = new URL(appUrl);
  } catch {
    throw new Error("INVALID_APP_URL");
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.username || base.password || !base.hostname) {
    throw new Error("INVALID_APP_URL");
  }
  const callback = new URL(localizedPath(locale, "/join"), base.origin);
  callback.searchParams.set("plan", plan);
  return callback.toString();
}
