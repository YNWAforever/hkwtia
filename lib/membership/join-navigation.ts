import type {AppLocale} from "@/i18n/routing";
import type {JoinStep} from "@/lib/membership/onboarding";
import type {PlanCode} from "@/lib/membership/plans";
import {localizedPath} from "@/lib/urls";

const joinContinuations = ["/portal", "/portal/profile", "/portal/company"] as const;
export type JoinContinuation = (typeof joinContinuations)[number];

/** Return a canonical, locale-neutral portal path or null for untrusted input. */
export function parseJoinContinuation(value: unknown, locale?: AppLocale): JoinContinuation | null {
  if (typeof value !== "string" || value.length === 0 || value.includes("\\") || value.includes("\r") || value.includes("\n")) return null;
  const localizedPrefix = "/zh";
  const canonical = value.startsWith(`${localizedPrefix}/`) ? value.slice(localizedPrefix.length) : value;
  if (locale === "en" && value.startsWith(`${localizedPrefix}/`)) return null;
  if (locale === "zh-HK" && !value.startsWith(localizedPrefix) && !value.startsWith("/portal")) return null;
  if (!joinContinuations.includes(canonical as JoinContinuation)) return null;
  const parsed = new URL(value, "http://portal.local");
  if (parsed.origin !== "http://portal.local" || parsed.pathname !== value || parsed.search || parsed.hash) return null;
  return canonical as JoinContinuation;
}

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

export function buildJoinCallback(appUrl: string, locale: AppLocale, plan: PlanCode, continuation?: string | null): string {
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
  if (continuation != null) {
    const next = parseJoinContinuation(continuation, locale);
    if (!next) throw new Error("INVALID_CONTINUATION");
    callback.searchParams.set("next", next);
  }
  return callback.toString();
}
