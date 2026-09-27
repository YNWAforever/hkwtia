"use server";

import {headers} from "next/headers";
import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {auth} from "@/lib/auth/server";
import {checkAuthSend} from "@/lib/auth/rate-limit";
import {appEnv} from "@/lib/config/env";
import {allowedAdminDestination} from "@/lib/auth/login-destination";
import {isPortalContinuation, type PortalContinuation} from "@/lib/portal/continuation";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {localizedPath} from "@/lib/urls";

// Same shape as app/[locale]/(join)/join/actions.ts's emailSchema.
const emailSchema = z.string().trim().email();

export type MemberLoginResult =
  | {ok: true}
  | {ok: false; error: "invalid_email" | "invalid_continuation" | "rate_limited" | "provider_error"};

/**
 * Mirrors lib/membership/join-navigation.ts's buildJoinCallback, pointed at
 * /member-login instead of /join. Kept local rather than added to
 * join-navigation.ts, which stays Join-only per the Task 4 design boundary.
 */
function buildLoginCallback(appUrl: string, locale: AppLocale, continuation: string, intent: "member" | "admin"): string {
  let base: URL;
  try {
    base = new URL(appUrl);
  } catch {
    throw new Error("INVALID_APP_URL");
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.username || base.password || !base.hostname) {
    throw new Error("INVALID_APP_URL");
  }
  const callback = new URL(localizedPath(locale, intent === "admin" ? "/admin-login" : "/member-login"), base.origin);
  callback.searchParams.set("next", continuation);
  return callback.toString();
}

export async function requestMemberLoginLink(
  input: {email: unknown; next: string | null},
  locale: AppLocale,
): Promise<MemberLoginResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return {ok: false, error: "invalid_email"};

  let continuation: PortalContinuation;
  if (input.next == null) {
    continuation = "/portal";
  } else if (isPortalContinuation(input.next)) {
    continuation = input.next;
  } else {
    // Strict rejection: an out-of-allowlist `next` must fail loudly, unlike
    // parsePortalContinuation's fail-open default used by the page itself.
    return {ok: false, error: "invalid_continuation"};
  }

  return sendValidatedLoginLink(email.data, continuation, locale, "member");
}

export async function requestAdminLoginLink(
  input: {email: unknown; next: string | null},
  locale: AppLocale,
): Promise<MemberLoginResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return {ok: false, error: "invalid_email"};
  const continuation = input.next === null ? "/admin" : allowedAdminDestination(input.next);
  if (!continuation) return {ok: false, error: "invalid_continuation"};
  return sendValidatedLoginLink(email.data, continuation, locale, "admin");
}

async function sendValidatedLoginLink(
  email: string,
  continuation: string,
  locale: AppLocale,
  intent: "member" | "admin",
): Promise<MemberLoginResult> {
  // Server Actions call the provider directly; the API catch-all is not on this path.
  const send = await checkAuthSend({ip: clientIpFromHeaders(await headers()), email});
  if (!send.allowed) return {ok: false, error: "rate_limited"};
  const callbackURL = buildLoginCallback(appEnv().appUrl, locale, continuation, intent);
  try {
    const result = await auth.signIn.magicLink({email, callbackURL});
    if (result?.error) return {ok: false, error: "provider_error"};
  } catch {
    return {ok: false, error: "provider_error"};
  }
  return {ok: true};
}
